import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePerplWallet } from "./usePerplWallet";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const response = (address: string) => new Response(JSON.stringify({ address, account: null, positions: [], unsupportedMarkets: [], block: 1, readAt: 100 }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Perpl wallet polling", () => {
  it("does not fetch before a wallet is submitted", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    renderHook(() => usePerplWallet(null));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("ignores a late response after switching wallets and clears on reset", async () => {
    let finishA!: (r: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finishA = resolve; })).mockResolvedValueOnce(response(B));
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(({ address }: { address: string | null }) => usePerplWallet(address), { initialProps: { address: A as string | null } });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ address: B });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.address).toBe(B));
    await act(async () => { finishA(response(A)); });
    expect(result.current.data?.address).toBe(B);
    rerender({ address: null });
    expect(result.current.data).toBeNull();
  });
  it("keeps old data with an explicit error after a failed refresh", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(response(A)).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => usePerplWallet(A));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data?.address).toBe(A);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.error).toBe(true);
    expect(result.current.data?.address).toBe(A);
  });
  it("rejects a response for the wrong account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(B)));
    const { result } = renderHook(() => usePerplWallet(A));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
