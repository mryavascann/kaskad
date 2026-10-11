import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryProtection, type Protection } from "@/lib/server/protection";
const state = vi.hoisted(() => ({ guard: undefined as Protection | undefined }));
vi.mock("@/lib/server/protection", async (original) => ({ ...await original<typeof import("@/lib/server/protection")>(), protection: () => state.guard! }));
import { POST } from "./route";
const rpc = { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
const req = (body: unknown = rpc, headers = {}) => new Request("http://localhost/api/rpc", { method: "POST", body: JSON.stringify(body), headers: { "x-real-ip": "192.0.2.1", ...headers } });
let upstream: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.stubEnv("MONAD_TESTNET_RPC", "https://provider.example/secret");
  state.guard = memoryProtection();
  upstream = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result = (b: typeof rpc) => ({ jsonrpc: "2.0", id: b.id, result: "0x279f" });
    return Response.json(Array.isArray(body) ? body.map(result) : result(body));
  });
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("RPC route", () => {
  it("forwards valid calls and never caches responses", async () => {
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ result: "0x279f" });
    expect(upstream.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("rejects invalid batches and oversized bodies before forwarding", async () => {
    expect((await POST(req([rpc, { ...rpc, method: "eth_getLogs" }]))).status).toBe(400);
    expect((await POST(req("x".repeat(256 * 1024)))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("counts each batch item and honors x-real-ip across forged forwarded headers", async () => {
    for (let i = 0; i < 18; i++) expect((await POST(req(Array.from({ length: 10 }, () => rpc), { "x-forwarded-for": `198.51.100.${i}` }))).status).toBe(200);
    const limited = await POST(req());
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(upstream).toHaveBeenCalledTimes(18);
  });
  it("sanitizes upstream HTTP errors and exceptions", async () => {
    upstream.mockResolvedValueOnce(new Response("secret URL", { status: 500 }));
    expect(await (await POST(req())).text()).not.toContain("secret");
    upstream.mockRejectedValueOnce(new Error("https://provider.example/secret"));
    const response = await POST(req());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("secret");
  });
  it("stops before the upstream when shared protection is unavailable", async () => {
    const { ApiError } = await import("@/lib/server/request");
    state.guard!.consume = vi.fn().mockRejectedValue(new ApiError(503, "koruma kullanılamıyor", 10));
    expect((await POST(req())).status).toBe(503); expect(upstream).not.toHaveBeenCalled();
  });
  it("compresses large JSON when the client accepts gzip", async () => {
    const result = { jsonrpc: "2.0", id: 1, result: `0x${"ab".repeat(2000)}` };
    upstream.mockResolvedValueOnce(Response.json(result));
    const response = await POST(req(rpc, { "accept-encoding": "gzip" }));
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString())).toEqual(result);
  });
});
