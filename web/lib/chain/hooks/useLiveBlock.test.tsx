import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainReader } from "../reader";
import { LIVE_BLOCK_POLL_MS, useLiveBlock } from "./useLiveBlock";

let hidden = false;
const setHidden = (h: boolean) => {
  hidden = h;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("useLiveBlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "hidden");
  });

  it("polls eth_blockNumber every ~3 s while visible, never goes backwards, pauses when hidden", async () => {
    const blocks = [100n, 105n, 104n, 110n];
    const getBlockNumber = vi.fn<(a?: { cacheTime?: number }) => Promise<bigint>>(async () => blocks.shift() ?? 200n);
    const reader = { getBlockNumber } as unknown as ChainReader;
    const { result, unmount } = renderHook(() => useLiveBlock({ reader }));
    expect(result.current).toEqual({ block: null, updatedAt: null, error: null });

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.block).toBe(100n);
    expect(result.current.updatedAt).toEqual(expect.any(Number));
    expect(getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });

    await act(() => vi.advanceTimersByTimeAsync(LIVE_BLOCK_POLL_MS));
    expect(result.current.block).toBe(105n);
    await act(() => vi.advanceTimersByTimeAsync(LIVE_BLOCK_POLL_MS)); // a lagging node answers 104
    expect(result.current.block).toBe(105n);
    expect(getBlockNumber).toHaveBeenCalledTimes(3);

    act(() => setHidden(true));
    await act(() => vi.advanceTimersByTimeAsync(LIVE_BLOCK_POLL_MS * 10));
    expect(getBlockNumber).toHaveBeenCalledTimes(3);

    act(() => setHidden(false));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getBlockNumber).toHaveBeenCalledTimes(4);
    expect(result.current.block).toBe(110n);

    unmount();
    await act(() => vi.advanceTimersByTimeAsync(LIVE_BLOCK_POLL_MS * 5));
    expect(getBlockNumber).toHaveBeenCalledTimes(4);
  });

  it("keeps the last block and reports a typed error when a read fails", async () => {
    const getBlockNumber = vi
      .fn<(a?: { cacheTime?: number }) => Promise<bigint>>()
      .mockResolvedValueOnce(7n)
      .mockRejectedValueOnce(new Error("HTTP request failed.\n\nStatus: 429"))
      .mockResolvedValue(8n);
    const reader = { getBlockNumber } as unknown as ChainReader;
    const { result } = renderHook(() => useLiveBlock({ reader }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(LIVE_BLOCK_POLL_MS));
    expect(result.current.block).toBe(7n);
    expect(result.current.error?.code).toBe("rate-limited");
    await act(() => vi.advanceTimersByTimeAsync(LIVE_BLOCK_POLL_MS));
    expect(result.current).toMatchObject({ block: 8n, error: null });
  });
});
