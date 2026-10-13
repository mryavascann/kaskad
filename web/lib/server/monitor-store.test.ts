import { describe, expect, it, vi } from "vitest";
import { monitorStore } from "./monitor-store";
import { type State } from "./monitor-checks";

const env = { KV_REST_API_URL: "https://kv.example", KV_REST_API_TOKEN: "test-kv-secret" };
const state: State = { version: 1, measuredAt: "2026-10-13T18:00:00.000Z", notifiedFingerprint: null, nansenPaused: true };

describe("persistent monitor state", () => {
  it.each([
    {}, { KV_REST_API_URL: "https://kv.example" }, { KV_REST_API_TOKEN: "test" },
    { KV_REST_API_URL: "http://kv.example", KV_REST_API_TOKEN: "test" },
    { KV_REST_API_URL: "https://kv.example", UPSTASH_REDIS_REST_TOKEN: "test" },
  ])("requires a complete TLS store and never falls back to memory: %j", config => {
    const fetcher = vi.fn<typeof fetch>();
    expect(() => monitorStore(config, fetcher)).toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([{ error: "private-kv-detail" }, {}, { result: 5 }, { result: "bad-json" }, { result: "{}" }])(
    "does not treat a malformed Redis read as absent history: %j", async body => {
      const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
      await expect(monitorStore(env, fetcher).read()).rejects.toThrow();
    });

  it("preserves the cost pause across independent instances and excludes unknown fields", async () => {
    let saved: string | null = null;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const args = JSON.parse(String(init?.body));
      expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-kv-secret");
      if (args[0] === "GET") return Response.json({ result: saved });
      saved = args[2];
      expect(args[3]).toBe("EX"); expect(args[4]).toBeGreaterThan(0);
      return Response.json({ result: "OK" });
    });
    expect(await monitorStore(env, fetcher).read()).toBeUndefined();
    await monitorStore(env, fetcher).write({ ...state, secret: "never-store" } as State);
    expect(await monitorStore(env, fetcher).read()).toEqual(state);
    expect(saved).not.toContain("never-store");
  });

  it("requires an acknowledged write before reporting success", async () => {
    for (const result of [null, 1, "error"]) {
      await expect(monitorStore(env, async () => Response.json({ result })).write(state)).rejects.toThrow();
    }
  });

  it("releases the acquired lease when the shared frequency limit rejects a request", async () => {
    const commands: unknown[][] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const args = JSON.parse(String(init?.body)); commands.push(args);
      return Response.json({ result: commands.length === 1 ? "OK" : commands.length === 2 ? 59_000 : 1 });
    });
    await expect(monitorStore(env, fetcher).acquire()).rejects.toMatchObject({ status: 429, retryAfter: 59 });
    expect(commands).toHaveLength(3);
    expect(String(commands[2][1])).toContain("DEL");
    expect(commands[2][3]).toBe(commands[0][1]);
    expect(commands[2][4]).toBe(commands[0][2]);
  });
});
