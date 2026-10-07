import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), client: vi.fn(() => ({})) }));
vi.mock("@/lib/kaskad/perpl-wallet", () => ({ readPerplWallet: mocks.read }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: mocks.client }));
const address = "0x1111111111111111111111111111111111111111";
const request = (value = address, ip = "test") => new Request(`https://kaskad.test/api/perpl/wallet?address=${value}`, { headers: { "x-real-ip": ip } });
let GET: typeof import("./route").GET;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("MONAD_MAINNET_RPC", "https://rpc.invalid");
  mocks.read.mockResolvedValue({ address, account: null, positions: [], unsupportedMarkets: [], block: 1, readAt: 100 });
  ({ GET } = await import("./route"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Perpl wallet endpoint", () => {
  it("rejects invalid addresses before calling the provider", async () => {
    expect((await GET(request("bad"))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("reports missing configuration without leaking credentials", async () => {
    vi.stubEnv("MONAD_MAINNET_RPC", "");
    expect((await GET(request())).status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("coalesces reads and marks wallet responses no-store", async () => {
    const [a, b] = await Promise.all([GET(request()), GET(request())]);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(a.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("does not retain failed reads or expose upstream errors", async () => {
    mocks.read.mockRejectedValueOnce(new Error("provider credentials and raw error"));
    const res = await GET(request());
    expect(res.status).toBe(502); expect(await res.json()).toEqual({ error: "read_failed" });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("limits a caller and lets the minute window expire", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    for (let i = 0; i < 30; i++) expect((await GET(request())).status).toBe(200);
    expect((await GET(request())).status).toBe(429);
    expect((await GET(request(address, "different"))).status).toBe(200);
    now += 60_000;
    expect((await GET(request())).status).toBe(200);
  });
});
