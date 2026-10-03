// Risk map: every real book × a row of shocks, with the debt each cascade leaves stuck or bad. Each
// book is read from the chain once (readBook: price, depth, recovery, raw slots), then every shock runs
// through the engine's exact off-chain mirror (replay.ts) instead of one eth_call per cell. One cell
// is checked against an on-chain preview (`verifyCell`); the map is only shown when they agree.

import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { readBook, type Book } from "./book";
import type { ChainReader } from "./reader";
import { replay } from "./replay";
import { BASE_SETTINGS, ORACLE_FEEDBACK_BPS } from "./scenario";
import type { Result } from "./types";

/** Columns: final depeg of the dominant collateral, in bps. */
export const RISK_MAP_SHOCKS_BPS: readonly number[] = [100, 300, 500, 1_000, 2_000];
/** Books with less debt than this are left off the map (dust books add rows, not information). */
export const RISK_MAP_MIN_DEBT_USD = 250_000;
/** Ethereum comparison books (deployment.json ids 7, 13-15): Aave on Ethereum, simulated on Monad. */
const ETHEREUM_BOOKS = new Set([7, 13, 14, 15]);

/** `hiddenBadDebtUsd`: underwater at the pool's spot price but solvent on the oracle (replay.ts). */
export type RiskCell = { shockBps: number; stuckDebtUsd: number; badDebtUsd: number; liquidatedUsd: number; hiddenBadDebtUsd: number };
export type RiskRow = { assetId: number; symbol: string; group: "monad" | "ethereum"; debtUsd: number; positions: number; cells: RiskCell[] };
export type RiskMap = { rows: RiskRow[]; shocksBps: readonly number[]; steps: number; rounds: number };

/** The books on the map, largest debt first within each group (Monad first). */
export function riskMapAssets(): { assetId: number; group: "monad" | "ethereum" }[] {
  return Object.values(DEPLOYMENT.assets)
    .filter((a) => a.realPositions > 0 && a.debtUsd >= RISK_MAP_MIN_DEBT_USD)
    .map((a) => ({ assetId: a.id, group: ETHEREUM_BOOKS.has(a.id) ? ("ethereum" as const) : ("monad" as const), debt: a.debtUsd }))
    .sort((x, y) => (x.group === y.group ? y.debt - x.debt : x.group === "monad" ? -1 : 1))
    .map(({ assetId, group }) => ({ assetId, group }));
}

/** One row from a book already read: the console's default run (20 blocks, 3 waves, external oracle) at each shock. */
export function riskRow(book: Book, group: "monad" | "ethereum", shocksBps: readonly number[] = RISK_MAP_SHOCKS_BPS): RiskRow {
  const slots = book.positions.map((p) => p.raw);
  const replayBook = { priceWad: book.priceWad, depthUsdWad: book.depthUsdWad, bookDebt1e6: book.bookDebt1e6, recoveryBps: book.recoveryBps, slots };
  const cells = shocksBps.map((shockBps) => {
    const r = replay(replayBook, {
      shockBps,
      steps: BASE_SETTINGS.steps,
      maxRoundsPerStep: BASE_SETTINGS.rounds,
      maxPositions: slots.length,
      oracleFeedbackBps: ORACLE_FEEDBACK_BPS.external,
    });
    return {
      shockBps,
      stuckDebtUsd: wadToNum(r.stuckDebt),
      badDebtUsd: wadToNum(r.badDebt),
      liquidatedUsd: wadToNum(r.totalLiquidated),
      hiddenBadDebtUsd: wadToNum(r.hiddenBadDebt),
    };
  });
  const asset = DEPLOYMENT.assets[String(book.assetId)];
  return {
    assetId: book.assetId,
    symbol: asset?.symbol ?? String(book.assetId),
    group,
    debtUsd: Number(book.bookDebt1e6) / 1e6,
    positions: slots.length,
    cells,
  };
}

/**
 * The cell of `row` at `preview`'s shock must equal the on-chain preview of the same run (same book,
 * steps, rounds, oracle): stuck and bad debt to the dollar. False = do not show the map.
 */
export function verifyCell(row: RiskRow, shockBps: number, preview: Result): boolean {
  const cell = row.cells.find((c) => c.shockBps === shockBps);
  if (!cell) return false;
  return Math.abs(cell.stuckDebtUsd - wadToNum(preview.stuckDebt)) < 1 && Math.abs(cell.badDebtUsd - wadToNum(preview.badDebt)) < 1;
}

/** Attempts per book: the public RPC drops a request now and then. */
const READ_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_000;

/**
 * Reads every book on the map (a few eth_calls each, one book at a time: the public RPC rate-limits
 * bursts) and replays the shocks. A book that still fails to read is left out.
 */
export async function fetchRiskMap(opts: { reader?: ChainReader; retryDelayMs?: number } = {}): Promise<RiskMap> {
  const rows: RiskRow[] = [];
  for (const { assetId, group } of riskMapAssets()) {
    for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
      try {
        rows.push(riskRow(await readBook(assetId, { reader: opts.reader }), group));
        break;
      } catch {
        if (attempt < READ_ATTEMPTS) await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? RETRY_DELAY_MS));
      }
    }
  }
  return { rows, shocksBps: RISK_MAP_SHOCKS_BPS, steps: BASE_SETTINGS.steps, rounds: BASE_SETTINGS.rounds };
}
