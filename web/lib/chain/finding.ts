// The landing page's finding, computed live: syrupUSDC -3 % on the real Monad Aave book with the
// external-price oracle (preset "sali"). Mapping to the engine Result (contracts/src/Kaskad.sol):
//   stuckDebtUsd = Result.stuckDebt       debt under HF 1 that no instant-sale liquidator can clear
//   clearedUsd   = Result.totalLiquidated debt liquidators could repay by selling into the pool
//   gapRatio     = stuckDebt / totalLiquidated
//   badDebtUsd   = Result.badDebt         shortfall after all collateral (0 in this scenario)
// Pool depth and its measured/assumed label come from deployment.json. See README.md for the values
// observed on chain.

import type { Address } from "viem";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { classifyPositions, readBook, type Classification } from "./book";
import { engineFor, previewScenario } from "./engine";
import { defaultReader, type ChainReader } from "./reader";
import { buildScenario, presetById, symbolParts, type PresetId } from "./scenario";
import type { OracleMode, Result, Scenario } from "./types";

export const FINDING_PRESET: PresetId = "sali";

/** syrupUSDC -3 %, real book (all positions), steps 20, rounds 3, feedback 0. */
export function findingScenario(): Scenario {
  return buildScenario(presetById(FINDING_PRESET).settings);
}

export type Finding = {
  scenario: Scenario;
  engine: Address;
  /** Monad testnet block the preview ran at; null when not pinned. */
  blockNumber: bigint | null;
  /** Local time the preview was fetched (ms since epoch). */
  fetchedAt: number;
  assetId: number;
  symbol: string;
  shockPct: number;
  oracle: OracleMode;
  book: "real";
  stuckDebtUsd: number;
  clearedUsd: number;
  /** stuckDebt / totalLiquidated; null when nothing was liquidated. */
  gapRatio: number | null;
  badDebtUsd: number;
  totalDebtUsd: number;
  stuckShare: number;
  liquidations: number;
  rounds: number;
  positionsUsed: number;
  gasUsed: bigint;
  memoryBytes: bigint;
  startPrice: number;
  finalPrice: number;
  /** Exit pool the seized collateral is sold into (deployment.json), with its honesty label. */
  poolDepthUsd: number;
  depthIsAssumption: boolean;
  depthNote: string;
  depthSource: string;
  /** Monad mainnet block the book snapshot was taken at. */
  sourceBlock: number;
  result: Result;
};

/** Pure: Finding from an engine result (no network). */
export function findingFacts(
  result: Result,
  scenario: Scenario,
  meta: { engine: Address; blockNumber: bigint | null; fetchedAt: number },
): Finding {
  const a = DEPLOYMENT.assets[scenario.assetId & 0xff];
  const stuck = wadToNum(result.stuckDebt);
  const cleared = wadToNum(result.totalLiquidated);
  const total = wadToNum(result.totalDebt);
  return {
    scenario,
    engine: meta.engine,
    blockNumber: meta.blockNumber,
    fetchedAt: meta.fetchedAt,
    assetId: a.id,
    symbol: symbolParts(a).base,
    shockPct: scenario.shockBps / 100,
    oracle: scenario.oracleFeedbackBps > 0 ? "pool" : "external",
    book: "real",
    stuckDebtUsd: stuck,
    clearedUsd: cleared,
    gapRatio: cleared > 0 ? stuck / cleared : null,
    badDebtUsd: wadToNum(result.badDebt),
    totalDebtUsd: total,
    stuckShare: stuck / Math.max(1, total),
    liquidations: result.liquidations,
    rounds: result.rounds,
    positionsUsed: result.positionsUsed,
    gasUsed: result.gasUsed,
    memoryBytes: result.memoryBytes,
    startPrice: wadToNum(result.startPrice),
    finalPrice: wadToNum(result.finalPrice),
    poolDepthUsd: a.depthUsd,
    depthIsAssumption: a.depthIsAssumption,
    depthNote: a.depthNote,
    depthSource: a.depthSource,
    sourceBlock: DEPLOYMENT.source.block,
    result,
  };
}

/**
 * Live finding: eth_blockNumber, then one free preview pinned to that block (2 requests). Works in
 * the browser (via /api/rpc) and on the server (public RPC); cache it on the server.
 */
export async function fetchFinding(opts: { reader?: ChainReader } = {}): Promise<Finding> {
  const reader = opts.reader ?? defaultReader();
  const scenario = findingScenario();
  const blockNumber = await reader.getBlockNumber({ cacheTime: 0 });
  const result = await previewScenario(scenario, { reader, blockNumber });
  return findingFacts(result, scenario, { engine: engineFor(scenario.assetId), blockNumber, fetchedAt: Date.now() });
}

/**
 * Per-position tiles for the finding: reads the book (about 2 requests) and classifies it against
 * the finding's preview. `consistent: false` means the mirror could not reproduce the engine.
 */
export async function fetchFindingPositions(finding: Finding, opts: { reader?: ChainReader } = {}): Promise<Classification> {
  const book = await readBook(finding.scenario.assetId, { maxPositions: finding.scenario.maxPositions, reader: opts.reader });
  return classifyPositions(book, finding.result, finding.scenario);
}
