import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PUT } from "./route";

const id = (n: number) => n.toString(16).padStart(64, "0");
const TOKEN = "ab".repeat(32);
const blob = { v: 1, nonce: "AAAAAAAAAAAAAAAA", ct: "c2VhbGVk" };
const req = (method: string, body?: unknown, query = "") =>
  new Request(`http://localhost/api/watchlist${query}`, {
    method,
    headers: { "content-type": "application/json", "x-real-ip": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

afterEach(() => vi.unstubAllEnvs());

describe("/api/watchlist", () => {
  it("stores a sealed blob under its anonymous id and hands back only the blob", async () => {
    expect((await GET(req("GET", undefined, `?id=${id(1)}`))).status).toBe(404);
    expect((await PUT(req("PUT", { id: id(1), token: TOKEN, blob }))).status).toBe(200);
    const res = await GET(req("GET", undefined, `?id=${id(1)}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blob }); // no token hash, nothing else
  });

  it("only the first writer's token may overwrite or delete", async () => {
    await PUT(req("PUT", { id: id(2), token: TOKEN, blob }));
    const other = "cd".repeat(32);
    expect((await PUT(req("PUT", { id: id(2), token: other, blob: { ...blob, ct: "b3RoZXI" } }))).status).toBe(403);
    expect((await DELETE(req("DELETE", { id: id(2), token: other }))).status).toBe(403);
    expect((await DELETE(req("DELETE", { id: id(2), token: TOKEN }))).status).toBe(200);
    expect((await GET(req("GET", undefined, `?id=${id(2)}`))).status).toBe(404);
  });

  it("rejects malformed ids, tokens and blobs", async () => {
    expect((await GET(req("GET", undefined, "?id=0x1234"))).status).toBe(400);
    expect((await PUT(req("PUT", { id: id(3), token: "short", blob }))).status).toBe(400);
    expect((await PUT(req("PUT", { id: id(3), token: TOKEN, blob: { ...blob, v: 2 } }))).status).toBe(400);
    expect((await PUT(req("PUT", { id: id(3), token: TOKEN, blob: { ...blob, ct: "x".repeat(12_001) } }))).status).toBe(400);
    expect((await PUT(req("PUT", { id: id(3), token: TOKEN, blob: { ...blob, address: "0xabc" } }))).status).toBe(200);
    // Unknown fields are not stored.
    expect(await (await GET(req("GET", undefined, `?id=${id(3)}`))).json()).toEqual({ blob });
  });

  it("answers unconfigured in production without a KV store instead of keeping data in memory", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    const res = await PUT(req("PUT", { id: id(4), token: TOKEN, blob }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unconfigured" });
  });
});
