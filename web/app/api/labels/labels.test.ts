import { describe, expect, it, vi } from "vitest";
import { memoryProtection } from "@/lib/server/protection";
import { ApiError } from "@/lib/server/request";
import { memoryLabelCache } from "./cache";
import { borrowerLabels, NANSEN_DAY_CAP, NANSEN_MINUTE_CAP, TOP_BORROWERS } from "./labels";

const setup = (response = () => Response.json({ data: [{ label: "Example", category: "defi" }] })) => {
  const cache = memoryLabelCache();
  const guard = memoryProtection();
  const fetchImpl = vi.fn(async () => response());
  return { cache, guard, fetchImpl };
};
describe("Nansen borrower labels", () => {
  it("queries only fixed snapshot borrowers and reuses the cache without paying twice", async () => {
    const deps = setup();
    const consume = vi.spyOn(deps.guard, "consume");
    const out = (await borrowerLabels("9", "unit-test-key", deps))!;
    expect(out.entries).toHaveLength(Math.min(TOP_BORROWERS, out.total));
    expect(out.entries[0].labels).toEqual([{ label: "Example", category: "defi" }]);
    const [url, init] = deps.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nansen.ai/api/v1/profiler/address/labels");
    expect(init.headers).toMatchObject({ apikey: "unit-test-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({ chain: "monad", address: out.entries[0].address, pagination: { page: 1, per_page: 100 } });
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(consume).toHaveBeenCalledWith([
      { key: "labels:upstream:minute", max: NANSEN_MINUTE_CAP, windowMs: 60_000 },
      { key: "labels:upstream:day", max: NANSEN_DAY_CAP, windowMs: 86_400_000 },
    ]);
    deps.fetchImpl.mockClear();
    await borrowerLabels("9", "unit-test-key", deps);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(out.entries.every((e, i, a) => i === 0 || a[i-1].debtUsd >= e.debtUsd)).toBe(true);
  });
  it("caches a successful empty list, but never caches failed lookups as unlabelled", async () => {
    const deps = setup(() => Response.json({ data: [] }));
    const out = (await borrowerLabels("10", "k", deps))!;
    expect(out.entries.every((e) => e.labels?.length === 0)).toBe(true);
    deps.fetchImpl.mockClear();
    await borrowerLabels("10", "k", deps);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([[401, "invalid-key"], [403, "invalid-key"], [402, "quota-exhausted"], [429, "rate-limited"], [500, "failed"]])("stops workers after upstream %s", async (status, code) => {
    const deps = setup(() => new Response(null, { status: Number(status) }));
    await expect(borrowerLabels("9", "k", deps)).rejects.toMatchObject({ code });
    expect(deps.fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
    deps.fetchImpl.mockImplementation(async () => Response.json({ data: [] }));
    expect((await borrowerLabels("10", "k", deps))?.entries.every((e) => e.labels !== null)).toBe(true);
  });
  it.each([
    { code: "insufficient_credits", error: "Account balance too low" },
    { error: "Insufficient credits" },
  ])("reports a 403 credit failure without rejecting the key or caching false empty labels: %j", async (error) => {
    const deps = setup(() => Response.json({
      ...error,
      message: "Insufficient credits remaining to call this endpoint.",
      detail: "private-provider-detail",
    }, { status: 403 }));
    await expect(borrowerLabels("10", "k", deps)).rejects.toMatchObject({ code: "quota-exhausted", message: "quota-exhausted" });
    expect(deps.fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
    deps.fetchImpl.mockClear();
    deps.fetchImpl.mockImplementation(async () => Response.json({ data: [] }));
    expect((await borrowerLabels("10", "k", deps))?.entries.every((e) => e.labels !== null)).toBe(true);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(3);
  });
  it.each([{}, { data: {} }, { data: [null] }, { data: [{ label: 1 }] }])("rejects malformed successful responses: %j", async (body) => {
    const deps = setup(() => Response.json(body));
    await expect(borrowerLabels("10", "k", deps)).rejects.toMatchObject({ code: "failed" });
  });
  it("makes no upstream request if cache or shared quota is unavailable", async () => {
    const deps = setup();
    vi.spyOn(deps.cache, "get").mockRejectedValue(new ApiError(503, "cache"));
    await expect(borrowerLabels("10", "k", deps)).rejects.toMatchObject({ status: 503 });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    const other = setup();
    vi.spyOn(other.guard, "consume").mockRejectedValue(new ApiError(429, "limit"));
    await expect(borrowerLabels("10", "k", other)).rejects.toMatchObject({ status: 429 });
    expect(other.fetchImpl).not.toHaveBeenCalled();
  });
  it("does not accept arbitrary books, calibrated books or prototype keys", async () => {
    const deps = setup();
    for (const asset of ["999", "265", "toString", "__proto__"]) expect(await borrowerLabels(asset, "k", deps)).toBeNull();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
  it("shared address locks prevent simultaneous requests from multiplying paid calls", async () => {
    const deps = setup();
    const results = await Promise.allSettled([borrowerLabels("10", "k", deps), borrowerLabels("10", "k", deps)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(3);
  });
});
