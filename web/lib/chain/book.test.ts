import { describe, expect, it, vi } from "vitest";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { packPosition } from "@/lib/kaskad/pack";
import { FIXTURE_RUNS, fixtureBook, fixtureRun } from "./__fixtures__/load";
import {
  BOOK_READ_MAX,
  canClassify,
  classifyPositions,
  compareWithEngine,
  readBook,
  readBookCached,
  type Book,
  type ClassifiedPosition,
} from "./book";
import type { ChainReader } from "./reader";
import { replay } from "./replay";
import type { Scenario } from "./types";

const replayOf = (book: Book, s: Scenario) =>
  replay(
    { priceWad: book.priceWad, depthUsdWad: book.depthUsdWad, bookDebt1e6: book.bookDebt1e6, recoveryBps: book.recoveryBps, slots: book.positions.map((p) => p.raw) },
    s,
  );

describe("replay mirrors the engine exactly (recorded Monad testnet previews)", () => {
  for (const run of FIXTURE_RUNS) {
    it(`${run.name}: every total and every wave`, () => {
      expect(compareWithEngine(run.result, replayOf(run.book, run.scenario))).toEqual([]);
    });
  }

  it("covers partial liquidation, spirals, recovery, stuck and bad debt", () => {
    const byName = Object.fromEntries(FIXTURE_RUNS.map((r) => [r.name, r.result]));
    expect(byName["sali"].liquidations).toBe(1);
    expect(byName["worst"].rounds).toBeGreaterThan(40);
    expect(byName["worst"].badDebt).toBeGreaterThan(0n);
    expect(fixtureBook("14").recoveryBps).toBe(5_000);
    expect(byName["usde-eth-5-external"].liquidations).toBeGreaterThan(1);
    expect(byName["usde-eth-5-pool"].stuckDebt).toBeGreaterThan(0n);
  });

  it("recovery matters: the same book without it does not reproduce the engine", () => {
    const run = fixtureRun("usde-eth-5-external");
    const noRecovery = { ...run.book, recoveryBps: 0 };
    expect(compareWithEngine(run.result, replayOf(noRecovery, run.scenario)).length).toBeGreaterThan(0);
  });

  it("validates like Kaskad._validate", () => {
    const b = fixtureBook("9");
    const s = fixtureRun("sali").scenario;
    expect(() => replayOf(b, { ...s, steps: 0 })).toThrow(/InvalidSteps/);
    expect(() => replayOf(b, { ...s, maxRoundsPerStep: 21 })).toThrow(/InvalidRounds/);
    expect(() => replayOf(b, { ...s, maxPositions: 58 })).toThrow(/InvalidPositions/);
    expect(() => replayOf(b, { ...s, shockBps: 10_001 })).toThrow(/InvalidShock/);
    expect(() => replayOf({ ...b, priceWad: 0n }, s)).toThrow(/InvalidAsset/);
  });

  it("a zero shock liquidates nothing on a healthy synthetic book", () => {
    const pos = { collateral: 2_000_000n, debt: 1_000_000n, otherColl: 0, collateralId: 9, ltBps: 9_200, bonusBps: 400, eMode: 1 };
    const r = replay(
      { priceWad: 10n ** 18n, depthUsdWad: 10n ** 24n, bookDebt1e6: 1_000_000n, recoveryBps: 0, slots: [packPosition(pos)] },
      { shockBps: 0, steps: 5, maxRoundsPerStep: 3, maxPositions: 1, oracleFeedbackBps: 10_000 },
    );
    expect(r).toMatchObject({ liquidations: 0, rounds: 0, badDebt: 0n, stuckDebt: 0n, finalPrice: 10n ** 18n });
    expect(r.positions[0]).toMatchObject({ end: "healthy", events: 0 });
    // HF = 2 * 0.92 / 1 = 1.84: liquidation price = debt / (lt * coll) = 1 / (0.92 * 2)
    expect(wadToNum(r.positions[0].liqPrice0)).toBeCloseTo(1 / 1.84, 6);
  });
});

describe("classifyPositions", () => {
  it("finding run: 30 positions stuck under the threshold (README), 27 safe, 1 partly liquidated", () => {
    const run = fixtureRun("sali");
    const c = classifyPositions(run.book, run.result, run.scenario);
    if (!c.consistent) throw new Error(JSON.stringify(c.mismatches));
    expect(c.counts).toEqual({ "bad-debt": 0, stuck: 30, liquidated: 0, safe: 27 });
    expect(c.belowThreshold).toBe(30);
    expect(c.everLiquidated).toBe(1);
    const hit = c.positions.filter((p) => p.liquidationEvents > 0);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ index: 12, outcome: "stuck", firstLiquidationStep: 7 });
    expect(hit[0].repaidUsd).toBeCloseTo(wadToNum(run.result.totalLiquidated), 6);
    expect(hit[0].finalHealthFactor!).toBeLessThan(1);
    // the stuck tiles add up to the engine's stuckDebt
    const stuck = c.positions.filter((p) => p.outcome === "stuck").reduce((s, p) => s + p.finalDebtUsd, 0);
    expect(stuck).toBeCloseTo(wadToNum(run.result.stuckDebt), 0);
    // the largest borrower: ~24.8 % of the debt, liquidatable after a ~2.3 % drop (README "Ne bulduk")
    const largest = c.positions.reduce((a, b) => (b.debtUsd > a.debtUsd ? b : a));
    expect(largest.debtUsd / wadToNum(run.result.totalDebt)).toBeCloseTo(0.248, 3);
    expect(largest.thresholdDrop!).toBeCloseTo(0.023, 3);
  });

  it("every recorded run: counts as recorded, per-position sums equal the engine totals", () => {
    for (const run of FIXTURE_RUNS) {
      const c = classifyPositions(run.book, run.result, run.scenario);
      if (!c.consistent) throw new Error(`${run.name}: ${JSON.stringify(c.mismatches)}`);
      expect(c.counts).toEqual(run.counts);
      const positions = c.positions;
      const sum = (f: (p: ClassifiedPosition) => number) => positions.reduce((s, p) => s + f(p), 0);
      expect(sum((p) => p.liquidationEvents)).toBe(run.result.liquidations);
      expect(sum((p) => p.repaidUsd)).toBeCloseTo(wadToNum(run.result.totalLiquidated), 0);
      expect(sum((p) => p.shortfallUsd)).toBeCloseTo(wadToNum(run.result.badDebt), 0);
      expect(sum((p) => (p.outcome === "stuck" ? p.finalDebtUsd : 0))).toBeCloseTo(wadToNum(run.result.stuckDebt), 0);
      expect(c.positions).toHaveLength(run.scenario.maxPositions);
    }
  });

  it("refuses to guess when the engine result differs from the replay", () => {
    const run = fixtureRun("sali");
    const off = classifyPositions(run.book, { ...run.result, stuckDebt: run.result.stuckDebt + 1n }, run.scenario);
    expect(off.consistent).toBe(false);
    if (off.consistent) return;
    expect(off.mismatches.map((m) => m.field)).toEqual(["stuckDebt"]);
    const wave = classifyPositions(run.book, { ...run.result, log: [{ ...run.result.log[0], seized: 1n }] }, run.scenario);
    expect(wave.consistent || wave.mismatches.map((m) => m.field)).toEqual(["log[0].seized"]);
    const other = classifyPositions(run.book, run.result, { ...run.scenario, assetId: 14 });
    expect(other.consistent).toBe(false);
  });

  it("canClassify: real books up to BOOK_READ_MAX", () => {
    expect(canClassify(fixtureRun("sali").scenario)).toBe(true);
    expect(canClassify({ ...fixtureRun("sali").scenario, assetId: 256 | 9, maxPositions: 500 })).toBe(false);
    expect(canClassify({ ...fixtureRun("sali").scenario, maxPositions: BOOK_READ_MAX + 1 })).toBe(false);
  });
});

/** Stub reader answering what readBook reads, from the recorded book. */
function bookReader(book: Book, opts: { multicall?: boolean; source?: string } = {}) {
  const readContract = vi.fn(async (req: { functionName: string; args?: readonly bigint[] }) => {
    switch (req.functionName) {
      case "source":
        return opts.source ?? DEPLOYMENT.contracts.kaskad;
      case "assets":
        return [book.priceWad, book.depthUsdWad];
      case "bookStats":
        return [0n, book.bookDebt1e6, 0n, book.count];
      case "recoveryBps":
        return book.recoveryBps;
      case "rawSlot":
        return book.positions[Number(req.args![1])].raw;
    }
    throw new Error(`unexpected ${req.functionName}`);
  });
  const multicall = vi.fn(async (req: { contracts: { args: readonly bigint[] }[] }) => {
    if (opts.multicall === false) throw new Error("multicall3 not deployed");
    return req.contracts.map((c) => book.positions[Number(c.args[1])].raw);
  });
  return { readContract, multicall, reader: { readContract, multicall } as unknown as ChainReader };
}

describe("readBook", () => {
  const recorded = fixtureBook("9");

  it("reads config + all slots (one multicall) and decodes positions", async () => {
    const { reader, multicall, readContract } = bookReader(recorded);
    const book = await readBook(9, { reader });
    expect(book).toMatchObject({ bookId: 9, assetId: 9, engine: DEPLOYMENT.contracts.kaskadMC, source: DEPLOYMENT.contracts.kaskad, count: 57, recoveryBps: 0 });
    expect(book.positions.map((p) => p.raw)).toEqual(recorded.positions.map((p) => p.raw));
    expect(book.positions[0]).toEqual(recorded.positions[0]);
    expect(multicall).toHaveBeenCalledTimes(1);
    expect(readContract).toHaveBeenCalledTimes(4); // source, assets, bookStats, recoveryBps
    const c = classifyPositions(book, fixtureRun("sali").result, fixtureRun("sali").scenario);
    expect(c.consistent).toBe(true);
  });

  it("falls back to small batches of plain reads without Multicall3", async () => {
    const { reader, readContract } = bookReader(recorded, { multicall: false });
    let inFlight = 0;
    let peak = 0;
    readContract.mockImplementation(async (req: { functionName: string; args?: readonly bigint[] }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      if (req.functionName === "rawSlot") return recorded.positions[Number(req.args![1])].raw;
      if (req.functionName === "source") return DEPLOYMENT.contracts.kaskad;
      if (req.functionName === "assets") return [recorded.priceWad, recorded.depthUsdWad];
      if (req.functionName === "bookStats") return [0n, recorded.bookDebt1e6, 0n, recorded.count];
      return 0;
    });
    const book = await readBook(9, { reader, maxPositions: 25 });
    expect(book.positions).toHaveLength(25);
    expect(book.positions.map((p) => p.raw)).toEqual(recorded.positions.slice(0, 25).map((p) => p.raw));
    expect(peak).toBeLessThanOrEqual(10);
  });

  it("refuses a different book source and books above BOOK_READ_MAX", async () => {
    await expect(readBook(9, { reader: bookReader(recorded, { source: "0x0000000000000000000000000000000000000001" }).reader })).rejects.toThrow(/reads books from/);
    const huge = { ...recorded, count: BOOK_READ_MAX + 1 };
    await expect(readBook(9, { reader: bookReader(huge).reader })).rejects.toThrow(RangeError);
  });

  it("readBookCached shares one read per book and forgets failures", async () => {
    const ok = bookReader(recorded);
    const a = readBookCached(9, 57, ok.reader);
    const b = readBookCached(9, 57, ok.reader);
    expect(a).toBe(b);
    await a;
    expect(ok.multicall).toHaveBeenCalledTimes(1);
    const failing = {
      readContract: vi.fn(async () => {
        throw new Error("down");
      }),
      multicall: vi.fn(),
    } as unknown as ChainReader;
    await expect(readBookCached(9, 11, failing)).rejects.toThrow("down");
    const retry = await readBookCached(9, 11, ok.reader); // the failure was not cached
    expect(retry.positions).toHaveLength(11);
    expect(ok.multicall).toHaveBeenCalledTimes(2);
  });
});
