import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/request";
import { GET } from "./route";
import { borrowerLabels, NansenError } from "./labels";
import { protection, memoryProtection } from "@/lib/server/protection";
vi.mock("./labels", async (original) => ({ ...(await original<typeof import("./labels")>()), borrowerLabels: vi.fn() }));
vi.mock("@/lib/server/protection", async (original) => ({ ...(await original<typeof import("@/lib/server/protection")>()), protection: vi.fn() }));
const request = (asset = "9") => new Request(`http://localhost/api/labels?asset=${asset}`);
beforeEach(() => {
  vi.stubEnv("NANSEN_API_KEY", "test-server-secret");
  vi.mocked(protection).mockReturnValue(memoryProtection());
  vi.mocked(borrowerLabels).mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("labels route", () => {
  it("validates input and configuration without querying the provider", async () => {
    expect((await GET(request("x"))).status).toBe(400);
    expect((await GET(request("999"))).status).toBe(404);
    vi.stubEnv("NANSEN_API_KEY", "");
    expect((await GET(request())).status).toBe(503);
    expect(borrowerLabels).not.toHaveBeenCalled();
  });
  it("keeps per-client limits shared across calls and marks responses no-store", async () => {
    for (let i = 0; i < 20; i++) expect((await GET(request())).status).toBe(200);
    const res = await GET(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(borrowerLabels).toHaveBeenCalledTimes(20);
  });
  it.each([new NansenError("invalid-key"), new NansenError("quota-exhausted"), new NansenError("rate-limited", 429), new ApiError(503, "secret-url"), new Error("secret-url")])("sanitizes errors: %s", async (error) => {
    vi.mocked(borrowerLabels).mockRejectedValue(error);
    const res = await GET(request());
    expect(res.status).toBe(error instanceof ApiError || error instanceof NansenError ? error.status : 502);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).not.toMatch(/secret-url|test-server-secret/);
  });
});
