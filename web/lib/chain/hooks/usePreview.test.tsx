import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureRun } from "../__fixtures__/load";
import { previewScenario } from "../engine";
import type { Result, Scenario } from "../types";
import { PREVIEW_DEBOUNCE_MS, usePreview } from "./usePreview";

vi.mock("../engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine")>()),
  previewScenario: vi.fn(),
}));
const preview = vi.mocked(previewScenario);

const a: Scenario = fixtureRun("sali").scenario;
const b: Scenario = { ...a, shockBps: 500 };
const c: Scenario = { ...a, shockBps: 700 };
const rA = fixtureRun("sali").result;
const rB: Result = { ...rA, rounds: 2 };

describe("usePreview (useKaskad.ts:76-107)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    preview.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("debounces 600 ms: a burst of changes sends one eth_call for the last scenario", async () => {
    preview.mockResolvedValue(rB);
    const { result, rerender } = renderHook(({ s }) => usePreview(s), { initialProps: { s: a } });
    expect(result.current.loading).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 100));
    rerender({ s: b });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS - 1));
    expect(preview).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith(b);
    expect(result.current).toMatchObject({ result: rB, error: null, loading: false, resultScenario: b });
  });

  it("ignores a stale response and keeps the previous result while loading", async () => {
    let resolveA: (r: Result) => void = () => {};
    preview.mockImplementationOnce(() => new Promise<Result>((r) => (resolveA = r))).mockResolvedValueOnce(rB);
    const { result, rerender } = renderHook(({ s }) => usePreview(s), { initialProps: { s: a } });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)); // request A in flight
    rerender({ s: b });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS)); // B answers first
    expect(result.current.result).toBe(rB);
    await act(async () => resolveA(rA)); // A arrives late: dropped
    expect(result.current.result).toBe(rB);
    expect(result.current.resultScenario).toEqual(b);

    preview.mockResolvedValueOnce(rA);
    rerender({ s: c });
    expect(result.current).toMatchObject({ loading: true, result: rB }); // key-derived loading, old result kept
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS));
    expect(result.current).toMatchObject({ loading: false, result: rA });
  });

  it("maps errors with the legacy rule and clears the result", async () => {
    preview.mockRejectedValue(new Error("execution reverted: out of gas"));
    const { result } = renderHook(() => usePreview(a));
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS));
    expect(result.current).toMatchObject({ result: null, loading: false, error: { code: "out-of-gas" } });
  });

  it("null disables it", async () => {
    const { result } = renderHook(() => usePreview(null));
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS * 2));
    expect(preview).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ loading: false, result: null });
  });

  it("initial data for the scenario on screen: ready at mount, no request (also when coming back to it)", async () => {
    preview.mockResolvedValue(rB);
    const initial = { scenario: { ...a }, result: rA, ms: 120 };
    const { result, rerender } = renderHook(({ s }) => usePreview(s, initial), { initialProps: { s: a } });
    expect(result.current).toMatchObject({ result: rA, error: null, loading: false, ms: 120, resultScenario: a });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS * 2));
    expect(preview).not.toHaveBeenCalled();

    rerender({ s: b }); // left before B's request went out: back on A, nothing to fetch
    rerender({ s: a });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS * 2));
    expect(preview).not.toHaveBeenCalled();

    rerender({ s: b });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS));
    expect(preview).toHaveBeenCalledWith(b);
    expect(result.current).toMatchObject({ result: rB, loading: false, resultScenario: b });
  });

  it("initial data for another scenario is ignored", async () => {
    preview.mockResolvedValue(rB);
    const { result } = renderHook(() => usePreview(b, { scenario: a, result: rA, ms: 1 }));
    expect(result.current).toMatchObject({ result: null, loading: true });
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS));
    expect(preview).toHaveBeenCalledWith(b);
    expect(result.current.result).toBe(rB);
  });
});
