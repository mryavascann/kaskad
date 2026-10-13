import { afterEach, describe, expect, it, vi } from "vitest";
import { labelCache, LABEL_TTL_SECONDS, memoryLabelCache, redisLabelCache } from "./cache";

afterEach(() => vi.useRealTimers());
describe("Nansen label cache", () => {
  it("requires a complete TLS shared store in production", () => {
    expect(() => labelCache({ NODE_ENV: "production" })).toThrow();
    expect(() => labelCache({ KV_REST_API_URL: "https://cache.example", UPSTASH_REDIS_REST_TOKEN: "x" })).toThrow();
    expect(() => labelCache({ KV_REST_API_URL: "http://cache.example", KV_REST_API_TOKEN: "x" })).toThrow();
    expect(labelCache({ NODE_ENV: "test" })).toBeTruthy();
  });
  it("expires successful empty labels after seven days", async () => {
    vi.useFakeTimers();
    const cache = memoryLabelCache();
    await cache.set("a", []);
    expect(await cache.get("a")).toEqual([]);
    vi.advanceTimersByTime(LABEL_TTL_SECONDS * 1000);
    expect(await cache.get("a")).toBeNull();
  });
  it.each([{ error: "READONLY" }, {}, { result: 4 }, { result: "not json" }, { result: "{}" }])("rejects Redis error/malformed reads instead of treating as a cache miss: %j", async (body) => {
    const cache = redisLabelCache("https://cache.example", "test", vi.fn(async () => Response.json(body)));
    await expect(cache.get("a")).rejects.toMatchObject({ status: 503 });
  });
  it("checks writes, TTL and read-through values", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ result: null })).mockResolvedValueOnce(Response.json({ result: "OK" })).mockResolvedValueOnce(Response.json({ result: "[]" })).mockResolvedValueOnce(Response.json({ error: "READONLY" }));
    const cache = redisLabelCache("https://cache.example", "test", fetcher);
    expect(await cache.get("a")).toBeNull();
    await cache.set("a", []);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(["SET", "a", "[]", "EX", LABEL_TTL_SECONDS]);
    expect(await cache.get("a")).toEqual([]);
    await expect(cache.set("a", [])).rejects.toMatchObject({ status: 503 });
  });
});
