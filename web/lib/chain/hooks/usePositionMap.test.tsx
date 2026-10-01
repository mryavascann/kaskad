import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixtureRun } from "../__fixtures__/load";
import { readBookCached } from "../book";
import { usePositionMap } from "./usePositionMap";

vi.mock("../book", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../book")>()),
  readBookCached: vi.fn(),
}));
const read = vi.mocked(readBookCached);
const sali = fixtureRun("sali");

describe("usePositionMap", () => {
  it("classifies the run once, even when the scenario object is new on every render", async () => {
    read.mockResolvedValue(sali.book);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePositionMap({ ...sali.scenario }, sali.result);
    });
    expect(result.current).toMatchObject({ eligible: true, loading: true, classification: null });
    await waitFor(() => expect(result.current.classification).not.toBeNull());
    const c = result.current.classification!;
    expect(c.consistent && c.counts.stuck).toBe(30);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(9, 57);
    expect(renders).toBeLessThan(5);
  });

  it("is not eligible for calibrated runs", () => {
    read.mockClear();
    const { result } = renderHook(() => usePositionMap({ ...sali.scenario, assetId: 256 | 9, maxPositions: 10_000 }, sali.result));
    expect(result.current).toMatchObject({ eligible: false, loading: false, classification: null });
    expect(read).not.toHaveBeenCalled();
  });
});
