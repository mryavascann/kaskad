import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redisProtection } from "./protection";

// Optional real-Lua integration: point KASKAD_REDIS_BIN at a directory containing redis-server
// and redis-cli. Creates a disposable Redis on a Unix socket, with no TCP listener/persistence.
const bin = process.env.KASKAD_REDIS_BIN;
const exec = promisify(execFile);
describe.skipIf(!bin)("real Redis atomic protection", () => {
  let directory: string;
  let socket: string;
  let server: ChildProcess;
  const command = async (args: (string | number)[]) => {
    const { stdout } = await exec(join(bin!, "redis-cli"), ["-s", socket, "--json", ...args.map(String)]);
    return JSON.parse(stdout);
  };
  // Only replaces REST transport. Redis itself executes the exact production Lua/SET commands.
  const fetcher: typeof fetch = async (_url, init) => Response.json({ result: await command(JSON.parse(String(init?.body))) });
  const instance = () => redisProtection("https://isolated-test.invalid", "test", fetcher);
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "kaskad-kv-"));
    socket = join(directory, "redis.sock");
    server = spawn(join(bin!, "redis-server"), ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = await command(["PING"]) === "PONG"; } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (!ready) throw new Error("Disposable Redis did not start");
  });
  afterAll(async () => {
    if (server && server.exitCode === null) {
      const stopped = new Promise((r) => server.once("exit", r)); server.kill("SIGTERM"); await stopped;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it("enforces one budget across concurrent independent instances without partial charges", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => instance().consume([
      { key: `integration:caller:${i}`, max: 1, windowMs: 10_000 },
      { key: "integration:budget", max: 7, windowMs: 10_000 },
    ])));
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(7);
    expect(await command(["GET", "kaskad:protection:v1:integration:budget"])).toBe("7");
    const rejected = attempts.findIndex((r) => r.status === "rejected");
    expect(await command(["GET", `kaskad:protection:v1:integration:caller:${rejected}`])).toBeNull();
    expect(await command(["PTTL", "kaskad:protection:v1:integration:budget"])).toBeGreaterThan(0);
  });
  it("measures weighted calls and expires quotas in Redis", async () => {
    const limit = { key: "integration:expiry", max: 10, cost: 6, windowMs: 10_000 };
    await instance().consume([limit]);
    await expect(instance().consume([limit])).rejects.toMatchObject({ status: 429 });
    await command(["PEXPIRE", "kaskad:protection:v1:integration:expiry", 1]);
    await new Promise((r) => setTimeout(r, 20));
    await expect(instance().consume([limit])).resolves.toBeUndefined();
  });
  it("grants only one lease and protects the new owner against stale release/renew", async () => {
    const old = await instance().lock("integration:sponsor");
    await expect(instance().lock("integration:sponsor")).rejects.toMatchObject({ status: 429 });
    await command(["PEXPIRE", "kaskad:protection:v1:integration:sponsor", 1]);
    await new Promise((r) => setTimeout(r, 20));
    const next = await instance().lock("integration:sponsor");
    await expect(old.renew()).rejects.toMatchObject({ status: 503 });
    await old.release();
    await expect(instance().lock("integration:sponsor")).rejects.toMatchObject({ status: 429 });
    await next.renew(); await next.release();
    const final = await instance().lock("integration:sponsor"); await final.release();
  });
});
