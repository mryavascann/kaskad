import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryProtection, protection, redisProtection, LIMIT_SCRIPT } from "./protection";

afterEach(() => vi.useRealTimers());
const quota = (key: string, max = 2, cost = 1) => ({ key, max, cost, windowMs: 10_000 });

describe("quotas and sponsor leases", () => {
  it("reserves weighted quotas atomically under concurrent callers", async () => {
    const guard = memoryProtection();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => guard.consume([quota("ip", 6, 2), quota("global", 10)])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    // Refused IP requests must not consume the second counter.
    await expect(guard.consume([quota("global", 10, 7)])).resolves.toBeUndefined();
    await expect(guard.consume([quota("global", 10)])).rejects.toMatchObject({ status: 429, retryAfter: 10 });
  });
  it("expires counters from their first use; denied requests do not extend expiry", async () => {
    vi.useFakeTimers();
    const guard = memoryProtection();
    await guard.consume([quota("one", 1)]);
    await vi.advanceTimersByTimeAsync(9_001);
    await expect(guard.consume([quota("one", 1)])).rejects.toMatchObject({ status: 429, retryAfter: 1 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(guard.consume([quota("one", 1)])).resolves.toBeUndefined();
  });
  it("rejects overlapping leases and prevents stale holders releasing renewed ownership", async () => {
    vi.useFakeTimers();
    const guard = memoryProtection();
    const old = await guard.lock("sponsor");
    await expect(guard.lock("sponsor")).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(120_001);
    const next = await guard.lock("sponsor");
    await expect(old.renew()).rejects.toMatchObject({ status: 503 });
    await old.release();
    await expect(guard.lock("sponsor")).rejects.toMatchObject({ status: 429 });
    await next.renew();
    await next.release();
    await expect(guard.lock("sponsor")).resolves.toBeDefined();
  });
  it("fails closed in production and on partial/mixed credentials", () => {
    for (const env of [
      { NODE_ENV: "production" },
      { KV_REST_API_URL: "https://kv.example", UPSTASH_REDIS_REST_TOKEN: "test" },
      { KV_REST_API_URL: "http://kv.example", KV_REST_API_TOKEN: "test" },
      { KV_REST_API_TOKEN: "test" },
    ]) expect(() => protection(env)).toThrow("koruma kullanılamıyor");
    expect(protection({ NODE_ENV: "test" })).toBeDefined();
    expect(protection({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://kv.example", UPSTASH_REDIS_REST_TOKEN: "test" })).toBeDefined();
  });
  it("sends all counters in a single EVAL, with TTLs and weights", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: 0 }));
    await redisProtection("https://kv.example", "test-token", fetcher).consume([quota("a", 10, 3), quota("b", 20)]);
    const init = fetcher.mock.calls[0][1]!;
    expect(JSON.parse(String(init.body))).toEqual(["EVAL", LIMIT_SCRIPT, 2, "kaskad:protection:v1:a", "kaskad:protection:v1:b", 3, 10, 10_000, 1, 20, 10_000]);
    expect(init).toMatchObject({ redirect: "error", cache: "no-store", headers: { authorization: "Bearer test-token" } });
  });
  it("honors Redis retry time, and never leaks Redis errors or falls back to memory", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const guard = redisProtection("https://kv.example", "test-token", fetcher);
    fetcher.mockResolvedValueOnce(Response.json({ result: 1501 }));
    await expect(guard.consume([quota("a")])).rejects.toMatchObject({ status: 429, retryAfter: 2 });
    for (const response of [Response.json({ error: "private-token" }), Response.json({ result: "0" }), new Response("private-token", { status: 500 })]) {
      fetcher.mockResolvedValueOnce(response);
      await expect(guard.consume([quota("a")])).rejects.toMatchObject({ status: 503, message: "koruma kullanılamıyor" });
    }
    fetcher.mockRejectedValueOnce(new Error("https://secret.example/api-key"));
    await expect(guard.consume([quota("a")])).rejects.toMatchObject({ status: 503, message: "koruma kullanılamıyor" });
  });
  it("uses a random owner token in atomic acquire/renew/release commands", async () => {
    const commands: unknown[][] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const args = JSON.parse(String(init?.body)); commands.push(args);
      return Response.json({ result: args[0] === "SET" ? "OK" : 1 });
    });
    const lease = await redisProtection("https://kv.example", "test", fetcher).lock("sponsor");
    await lease.renew(); await lease.release();
    expect(commands[0]).toEqual(["SET", "kaskad:protection:v1:sponsor", expect.any(String), "NX", "PX", 120_000]);
    expect(commands[1].slice(2)).toEqual([1, commands[0][1], commands[0][2], 120_000]);
    expect(commands[2].slice(2)).toEqual([1, commands[0][1], commands[0][2]]);
    fetcher.mockResolvedValueOnce(Response.json({ result: 0 }));
    await expect(lease.renew()).rejects.toMatchObject({ status: 503 });
    fetcher.mockResolvedValueOnce(Response.json({ result: null }));
    await expect(redisProtection("https://kv.example", "test", fetcher).lock("sponsor")).rejects.toMatchObject({ status: 429 });
  });
});
