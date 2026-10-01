import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { classifyPositions } from "@/lib/chain/book";
import {
  defaultScenario,
  tilesInput,
  INITIAL_KEEP_MS,
  INITIAL_RETRY_MS,
  INITIAL_TTL_MS,
  keepLastPageOnMissingPreview,
  loadInitialPreview,
  mergeInitial,
  resetInitialCache,
  type InitialPreview,
} from "./data";

const sali = fixtureRun("sali");
const classification = classifyPositions(sali.book, sali.result, sali.scenario);
const read = (over: Partial<InitialPreview> = {}): InitialPreview => ({
  scenario: sali.scenario,
  result: sali.result,
  ms: 200,
  blockNumber: 100,
  readAt: Date.now(),
  classification,
  ...over,
});

afterEach(() => {
  resetInitialCache();
  vi.useRealTimers();
});

describe("defaultScenario", () => {
  it("is the default preset (sali), the same scenario as the landing finding", () => {
    expect(defaultScenario()).toEqual(sali.scenario);
  });
});

describe("tilesInput", () => {
  it("keeps every position with the fields the tiles and their table read, and passes a mismatch through", () => {
    const t = tilesInput(classification);
    if (!t.consistent || !classification.consistent) throw new Error("fixture must classify");
    expect(t.positions).toHaveLength(classification.positions.length);
    expect(Object.keys(t.positions[0]).sort()).toEqual(
      ["debtUsd", "finalHealthFactor", "firstLiquidationStep", "healthFactor", "index", "liquidationPrice", "outcome", "thresholdDrop"].sort(),
    );
    expect(t.positions[0]).toMatchObject({ index: classification.positions[0].index, outcome: classification.positions[0].outcome });
    const mismatch = { consistent: false as const, bookId: 9, mismatches: [] };
    expect(tilesInput(mismatch)).toBe(mismatch);
  });
});

describe("mergeInitial", () => {
  it("takes the newer read, keeps a good earlier one over a failed, older-block or tile-less read", () => {
    const prev = read({ blockNumber: 100 });
    const newer = read({ blockNumber: 101 });
    expect(mergeInitial(null, newer)).toBe(newer);
    expect(mergeInitial(prev, newer)).toBe(newer);
    expect(mergeInitial(prev, null)).toBe(prev);
    expect(mergeInitial(prev, read({ blockNumber: 99 }))).toBe(prev);
    expect(mergeInitial(prev, read({ blockNumber: 101, classification: null }))).toBe(prev);
  });

  it("lets an earlier read stand in only within INITIAL_KEEP_MS", () => {
    const prev = read({ readAt: 0 });
    expect(mergeInitial(prev, null, INITIAL_KEEP_MS)).toBe(prev);
    expect(mergeInitial(prev, null, INITIAL_KEEP_MS + 1)).toBeNull();
  });
});

describe("loadInitialPreview", () => {
  it("memoizes a good read for INITIAL_TTL_MS, a failed one for INITIAL_RETRY_MS, and never replaces good data with a failure", async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date"] });
    const good = read({ readAt: Date.now() });
    const fn = vi
      .fn<() => Promise<InitialPreview>>()
      .mockResolvedValueOnce(good)
      .mockRejectedValueOnce(new Error("rpc down"))
      .mockRejectedValueOnce(new Error("rpc down"));
    expect(await loadInitialPreview(fn)).toBe(good);
    expect(await loadInitialPreview(fn)).toBe(good);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + INITIAL_TTL_MS);
    expect(await loadInitialPreview(fn)).toBe(good); // the read failed: the last good one stays
    expect(fn).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + INITIAL_RETRY_MS);
    expect(await loadInitialPreview(fn)).toBe(good);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("returns null (the client loading state) when nothing good was ever read", async () => {
    expect(await loadInitialPreview(() => Promise.reject(new Error("rpc down")))).toBeNull();
  });
});

describe("keepLastPageOnMissingPreview", () => {
  it("throws only while regenerating in production without a preview", () => {
    const d = read();
    expect(keepLastPageOnMissingPreview(d, { nodeEnv: "production" })).toBe(d);
    expect(keepLastPageOnMissingPreview(null, { nodeEnv: "production", phase: "phase-production-build" })).toBeNull();
    expect(keepLastPageOnMissingPreview(null, { nodeEnv: "development" })).toBeNull();
    expect(() => keepLastPageOnMissingPreview(null, { nodeEnv: "production" })).toThrow(/keeping the last generated page/);
  });
});
