import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureRun } from "../__fixtures__/load";
import { readBookCached } from "../book";
import type { BorrowerLabels } from "../exposure";
import { useExposure } from "./useExposure";
vi.mock("../book", async (original) => ({ ...(await original<typeof import("../book")>()), readBookCached: vi.fn() }));
const run = fixtureRun("sali");
const data: BorrowerLabels = {
  assetId: 9, chain: "monad", sourceBlock: 108133182, total: 57,
  entries: run.book.positions.map((p, i) => ({ raw: `0x${p.raw.toString(16)}`, address: `0x${(i+1).toString(16).padStart(40, "0")}`, debtUsd: 0, labels: [] })),
};
afterEach(() => vi.unstubAllGlobals());
describe("useExposure", () => {
  it("recovers from a rejected key without refreshing the app", async () => {
    vi.mocked(readBookCached).mockResolvedValue(run.book);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: "invalid-key" }, { status: 502 })).mockImplementation(async () => Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useExposure(run.scenario, run.result));
    await waitFor(() => expect(result.current.error).toBe("invalid-key"));
    expect(result.current.loading).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.exposure).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shows an error instead of a permanent spinner for a replay mismatch", async () => {
    vi.mocked(readBookCached).mockResolvedValue(run.book);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(data)));
    const { result } = renderHook(() => useExposure(run.scenario, { ...run.result, totalDebt: run.result.totalDebt + 1n }));
    await waitFor(() => expect(result.current.error).toBe("failed"));
    expect(result.current).toMatchObject({ loading: false, exposure: null });
  });
  it("retries failed book reads and keeps RPC errors out of the UI", async () => {
    vi.mocked(readBookCached).mockRejectedValueOnce(new Error("private RPC url")).mockResolvedValue(run.book);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(data)));
    const { result } = renderHook(() => useExposure(run.scenario, run.result));
    await waitFor(() => expect(result.current.error).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.exposure).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
  it("makes no queries for calibrated books and clears old results when switching", async () => {
    vi.mocked(readBookCached).mockClear().mockResolvedValue(run.book);
    const fetcher = vi.fn(async () => Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(({ assetId }) => useExposure({ ...run.scenario, assetId }, run.result), { initialProps: { assetId: 265 } });
    expect(result.current).toMatchObject({ eligible: false, exposure: null, loading: false });
    expect(readBookCached).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ assetId: 9 });
    await waitFor(() => expect(result.current.exposure).not.toBeNull());
    rerender({ assetId: 265 });
    expect(result.current).toMatchObject({ eligible: false, exposure: null, labels: null });
  });
});
