// Test helper: typed access to engine-runs.json (real books + on-chain previews, recorded read-only).
import type { Address } from "viem";
import { unpackPosition } from "@/lib/kaskad/pack";
import type { Book } from "../book";
import type { Result, Scenario } from "../types";
import fixture from "./engine-runs.json";

type RawResult = (typeof fixture.runs)[number]["result"];

export function fixtureBook(id: "9" | "14"): Book {
  const b = fixture.books[id];
  return {
    bookId: b.bookId,
    assetId: b.bookId & 0xff,
    engine: b.engine as Address,
    source: b.source as Address,
    priceWad: BigInt(b.priceWad),
    depthUsdWad: BigInt(b.depthUsdWad),
    bookDebt1e6: BigInt(b.bookDebt1e6),
    count: b.count,
    recoveryBps: b.recoveryBps,
    positions: b.slots.map((s, index) => ({ index, raw: BigInt(s), ...unpackPosition(BigInt(s)) })),
  };
}

export function toResult(r: RawResult): Result {
  return {
    totalDebt: BigInt(r.totalDebt),
    totalCollateral: BigInt(r.totalCollateral),
    totalLiquidated: BigInt(r.totalLiquidated),
    totalSeized: BigInt(r.totalSeized),
    badDebt: BigInt(r.badDebt),
    stuckDebt: BigInt(r.stuckDebt),
    startPrice: BigInt(r.startPrice),
    finalPrice: BigInt(r.finalPrice),
    rounds: r.rounds,
    liquidations: r.liquidations,
    positionsUsed: r.positionsUsed,
    gasUsed: BigInt(r.gasUsed),
    memoryBytes: BigInt(r.memoryBytes),
    log: r.log.map((l) => ({
      step: l.step,
      round: l.round,
      liquidations: l.liquidations,
      priceWad: BigInt(l.priceWad),
      liquidatedDebt: BigInt(l.liquidatedDebt),
      seized: BigInt(l.seized),
      deficit: BigInt(l.deficit),
    })),
  };
}

export type FixtureRun = {
  name: string;
  scenario: Scenario;
  counts: Record<"bad-debt" | "stuck" | "liquidated" | "safe", number>;
  result: Result;
  book: Book;
};

export const FIXTURE_RUNS: FixtureRun[] = fixture.runs.map((r) => ({
  name: r.name,
  scenario: r.scenario,
  counts: r.counts as FixtureRun["counts"],
  result: toResult(r.result),
  book: fixtureBook(String(r.scenario.assetId) as "9" | "14"),
}));

export const fixtureRun = (name: string): FixtureRun => {
  const r = FIXTURE_RUNS.find((x) => x.name === name);
  if (!r) throw new Error(`no fixture run ${name}`);
  return r;
};

export const FIXTURE_BLOCKS = fixture.blocks;
