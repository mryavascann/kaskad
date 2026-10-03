import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Classification } from "../book";
import type { Finding } from "../finding";

const fetchFinding = vi.fn<() => Promise<Finding>>();
const fetchFindingPositions = vi.fn<(f: Finding) => Promise<Classification>>();
vi.mock("../finding", () => ({ fetchFinding: () => fetchFinding(), fetchFindingPositions: (f: Finding) => fetchFindingPositions(f) }));

const { isNewerFinding, useFinding } = await import("./useFinding");

const at = (block: number | null) => ({ blockNumber: block === null ? null : BigInt(block), stuckDebtUsd: block ?? 0 }) as unknown as Finding;
const consistent = { consistent: true, bookId: 9, positions: [], counts: { "bad-debt": 0, stuck: 0, liquidated: 0, safe: 0 }, belowThreshold: 0, everLiquidated: 0, hiddenBadDebtUsd: 0, spotPrice: 1 } as Classification;
const inconsistent = { consistent: false, bookId: 9, mismatches: [] } as Classification;

const server = at(67_066_762);

beforeEach(() => {
  fetchFinding.mockReset();
  fetchFindingPositions.mockReset();
});

describe("isNewerFinding", () => {
  it("accepts only a strictly newer block over a known one", () => {
    expect(isNewerFinding(null, at(1))).toBe(true);
    expect(isNewerFinding(at(null), at(1))).toBe(true);
    expect(isNewerFinding(server, at(67_066_763))).toBe(true);
    expect(isNewerFinding(server, at(67_066_762))).toBe(false);
    expect(isNewerFinding(server, at(67_064_466))).toBe(false);
    expect(isNewerFinding(server, at(null))).toBe(false);
  });
});

describe("useFinding with server data", () => {
  it("keeps the server finding when the browser reads an older block (lagging node)", async () => {
    fetchFinding.mockResolvedValue(at(67_064_466));
    const { result } = renderHook(() => useFinding({ positions: true, initial: server, initialPositions: consistent }));
    await waitFor(() => expect(fetchFinding).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current.finding).toBe(server);
    expect(result.current.positions).toBe(consistent);
    expect(fetchFindingPositions).not.toHaveBeenCalled();
  });

  it("keeps the server data when the browser read fails", async () => {
    fetchFinding.mockRejectedValue(new Error("rpc down"));
    const { result } = renderHook(() => useFinding({ positions: true, initial: server, initialPositions: consistent }));
    await waitFor(() => expect(result.current.error).toBe("rpc down"));
    expect(result.current.finding).toBe(server);
    expect(result.current.positions).toBe(consistent);
  });

  it("keeps the consistent server pair over a newer finding whose positions don't classify", async () => {
    fetchFinding.mockResolvedValue(at(67_070_000));
    fetchFindingPositions.mockResolvedValue(inconsistent);
    const { result } = renderHook(() => useFinding({ positions: true, initial: server, initialPositions: consistent }));
    await waitFor(() => expect(fetchFindingPositions).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current.finding).toBe(server);
    expect(result.current.positions).toBe(consistent);
  });

  it("keeps the server pair when the newer positions read fails", async () => {
    fetchFinding.mockResolvedValue(at(67_070_000));
    fetchFindingPositions.mockRejectedValue(new Error("book read failed"));
    const { result } = renderHook(() => useFinding({ positions: true, initial: server, initialPositions: consistent }));
    await waitFor(() => expect(result.current.error).toBe("book read failed"));
    expect(result.current.finding).toBe(server);
  });

  it("takes a newer, consistent read", async () => {
    const newer = at(67_070_000);
    fetchFinding.mockResolvedValue(newer);
    fetchFindingPositions.mockResolvedValue(consistent);
    const { result } = renderHook(() => useFinding({ positions: true, initial: server, initialPositions: consistent }));
    await waitFor(() => expect(result.current.finding).toBe(newer));
    expect(result.current.positions).toBe(consistent);
  });
});

describe("useFinding without server data", () => {
  it("shows the finding as soon as it arrives, then its positions", async () => {
    const f = at(5);
    fetchFinding.mockResolvedValue(f);
    fetchFindingPositions.mockResolvedValue(consistent);
    const { result } = renderHook(() => useFinding({ positions: true }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.positions).toBe(consistent));
    expect(result.current.finding).toBe(f);
  });
});
