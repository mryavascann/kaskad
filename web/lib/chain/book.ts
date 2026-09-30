// Per-position view of a run: read the on-chain book, replay the engine off chain and classify each
// position, but only when the replay reproduces the on-chain preview exactly (every total and every
// wave). The UI draws one tile per position from `ClassifiedPosition`.

import type { Address } from "viem";
import { kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";
import { CALIBRATED, DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { unpackPosition, type PackedPosition } from "@/lib/kaskad/pack";
import { engineFor } from "./engine";
import { defaultReader, type ChainReader } from "./reader";
import { replay, type PositionEnd, type ReplayResult } from "./replay";
import type { Result, Scenario } from "./types";

/**
 * Most slots readBook() fetches. The largest real book has 300 positions; calibrated books
 * (up to 10,000) are not read slot by slot.
 */
export const BOOK_READ_MAX = 400;
/** rawSlot calldata is 68 bytes: ~64 slots per multicall eth_call. */
const MULTICALL_BYTES = 68 * 64;
/** Fallback without Multicall3: plain reads, at most this many per JSON-RPC batch (proxy limit 20). */
const PLAIN_READ_CHUNK = 10;

export type BookPosition = PackedPosition & { index: number; raw: bigint };

export type Book = {
  /** Book id as the engine sees it (assetId, | CALIBRATED for the calibrated book). */
  bookId: number;
  assetId: number;
  /** Engine that previews this book (engineFor(bookId)). */
  engine: Address;
  /** Contract that stores the slots (KaskadMC reads its source, Kaskad itself). */
  source: Address;
  priceWad: bigint;
  depthUsdWad: bigint;
  bookDebt1e6: bigint;
  /** Live bookStats(bookId).count. */
  count: number;
  /** Recovery the engine applies: KaskadMC.recoveryBps(asset), 0 on Kaskad. */
  recoveryBps: number;
  positions: BookPosition[];
};

/**
 * Reads what the engine reads for a book (KaskadMC.sol:207-245 / Kaskad.sol:189-198, 306-353):
 * asset price + depth, book stats, recovery, then the first `maxPositions` raw slots (default: all).
 * About 2 HTTP requests through the proxy (one small batch + one multicall).
 */
export async function readBook(bookId: number, opts: { maxPositions?: number; reader?: ChainReader } = {}): Promise<Book> {
  const reader = opts.reader ?? defaultReader();
  const assetId = bookId & 0xff;
  const engine = engineFor(bookId);
  const onMC = engine !== DEPLOYMENT.contracts.kaskad;
  const kaskad = DEPLOYMENT.contracts.kaskad;

  const [source, [priceWad, depthUsdWad], stats, recoveryBps] = await Promise.all([
    onMC ? reader.readContract({ address: engine, abi: kaskadMCAbi, functionName: "source" }) : Promise.resolve(kaskad),
    reader.readContract({ address: kaskad, abi: kaskadAbi, functionName: "assets", args: [BigInt(assetId)] }),
    reader.readContract({ address: kaskad, abi: kaskadAbi, functionName: "bookStats", args: [BigInt(bookId)] }),
    onMC
      ? reader.readContract({ address: engine, abi: kaskadMCAbi, functionName: "recoveryBps", args: [BigInt(assetId)] })
      : Promise.resolve(0),
  ]);
  if (source.toLowerCase() !== kaskad.toLowerCase()) throw new Error(`engine reads books from ${source}, not ${kaskad}`);
  const [, debt1e6, , count] = stats;
  const n = Math.min(opts.maxPositions ?? count, count);
  if (n > BOOK_READ_MAX) throw new RangeError(`book ${bookId} has ${n} positions; readBook reads at most ${BOOK_READ_MAX}`);

  const calls = Array.from({ length: n }, (_, i) => ({
    address: kaskad,
    abi: kaskadAbi,
    functionName: "rawSlot" as const,
    args: [BigInt(bookId), BigInt(i)] as const,
  }));
  let slots: bigint[];
  try {
    slots = (await reader.multicall({ contracts: calls, allowFailure: false, batchSize: MULTICALL_BYTES })) as bigint[];
  } catch {
    // no Multicall3 on this RPC (e.g. a local chain): plain reads, small sequential batches
    slots = [];
    for (let i = 0; i < n; i += PLAIN_READ_CHUNK) {
      const chunk = calls.slice(i, i + PLAIN_READ_CHUNK);
      slots.push(...(await Promise.all(chunk.map((c) => reader.readContract(c)))));
    }
  }
  return {
    bookId,
    assetId,
    engine,
    source: kaskad,
    priceWad,
    depthUsdWad,
    bookDebt1e6: debt1e6,
    count,
    recoveryBps: Number(recoveryBps),
    positions: slots.map((raw, index) => ({ index, raw, ...unpackPosition(raw) })),
  };
}

const bookCache = new Map<string, Promise<Book>>();

/**
 * readBook() memoized for the session (books are a static snapshot; the owner only changes them
 * with a reload script). A failed read is not cached.
 */
export function readBookCached(bookId: number, maxPositions: number, reader?: ChainReader): Promise<Book> {
  const key = `${bookId}:${maxPositions}`;
  let p = bookCache.get(key);
  if (!p) {
    p = readBook(bookId, { maxPositions, reader });
    bookCache.set(key, p);
    p.catch(() => bookCache.delete(key));
  }
  return p;
}

// ------------------------------------------------------------------ classification

/**
 * Tile state at the end of the run, mutually exclusive:
 * - "bad-debt": collateral value is below the debt at the final price (counted in badDebt);
 * - "stuck": below the liquidation threshold without a shortfall, and no instant-sale liquidator
 *   could clear it (counted in stuckDebt), whether or not it was partly liquidated;
 * - "liquidated": liquidated at least once and no longer under the threshold;
 * - "safe": never liquidated and not under the threshold at the end.
 */
export type PositionOutcome = "bad-debt" | "stuck" | "liquidated" | "safe";

export type ClassifiedPosition = {
  index: number;
  outcome: PositionOutcome;
  eMode: number;
  ltBps: number;
  bonusBps: number;
  debtUsd: number;
  collateralTokens: number;
  /** Dominant collateral value at the start price. */
  collateralUsd: number;
  otherCollateralUsd: number;
  healthFactor: number;
  /** Oracle price (USD) under which HF < 1 at the start; 0 = other collateral alone covers the debt. */
  liquidationPrice: number;
  /** Price drop from the start at which the position becomes liquidatable (<= 0: already is). */
  thresholdDrop: number | null;
  liquidationEvents: number;
  repaidUsd: number;
  seizedTokens: number;
  firstLiquidationStep: number | null;
  finalDebtUsd: number;
  finalCollateralTokens: number;
  finalHealthFactor: number | null;
  /** This position's part of the run's bad debt. */
  shortfallUsd: number;
};

export type ClassificationMismatch = { field: string; engine: string; replay: string };

export type Classification =
  | {
      consistent: true;
      bookId: number;
      positions: ClassifiedPosition[];
      counts: Record<PositionOutcome, number>;
      /** Positions under HF 1 at the end (bad-debt + stuck): README's "positions below threshold". */
      belowThreshold: number;
      /** Positions liquidated at least once (any outcome). */
      everLiquidated: number;
    }
  | { consistent: false; bookId: number; mismatches: ClassificationMismatch[] };

const RESULT_FIELDS = [
  "totalDebt",
  "totalCollateral",
  "totalLiquidated",
  "totalSeized",
  "badDebt",
  "stuckDebt",
  "startPrice",
  "finalPrice",
  "rounds",
  "liquidations",
  "positionsUsed",
] as const;
const LOG_FIELDS = ["step", "round", "liquidations", "priceWad", "liquidatedDebt", "seized", "deficit"] as const;

/** Field-by-field exact comparison of an engine Result with the replay (gas / memory excluded). */
export function compareWithEngine(r: Result, rep: ReplayResult): ClassificationMismatch[] {
  const out: ClassificationMismatch[] = [];
  for (const f of RESULT_FIELDS) {
    if (BigInt(r[f]) !== BigInt(rep[f])) out.push({ field: f, engine: String(r[f]), replay: String(rep[f]) });
  }
  if (r.log.length !== rep.log.length) out.push({ field: "log.length", engine: String(r.log.length), replay: String(rep.log.length) });
  else
    r.log.forEach((w, i) => {
      for (const f of LOG_FIELDS) {
        if (BigInt(w[f]) !== BigInt(rep.log[i][f])) out.push({ field: `log[${i}].${f}`, engine: String(w[f]), replay: String(rep.log[i][f]) });
      }
    });
  return out;
}

const hfOf = (collUsd: number, otherUsd: number, ltBps: number, debtUsd: number): number =>
  debtUsd > 0 ? ((collUsd + otherUsd) * ltBps) / 10_000 / debtUsd : Infinity;

/**
 * Classifies every simulated position of `book` for the run (`scenario`, `result` = its on-chain
 * preview). Returns `consistent: false` with the differences instead of a guess when the replay does
 * not reproduce the engine exactly (other book, other recovery, engine changed, ...).
 */
export function classifyPositions(book: Book, result: Result, scenario: Scenario): Classification {
  const bookId = book.bookId;
  if (scenario.assetId !== bookId || scenario.maxPositions > book.positions.length) {
    return {
      consistent: false,
      bookId,
      mismatches: [{ field: "scenario", engine: `book ${scenario.assetId} x ${scenario.maxPositions}`, replay: `book ${bookId} x ${book.positions.length}` }],
    };
  }
  const rep = replay(
    {
      priceWad: book.priceWad,
      depthUsdWad: book.depthUsdWad,
      bookDebt1e6: book.bookDebt1e6,
      recoveryBps: book.recoveryBps,
      slots: book.positions.map((p) => p.raw),
    },
    scenario,
  );
  const mismatches = compareWithEngine(result, rep);
  if (mismatches.length) return { consistent: false, bookId, mismatches };

  const p0 = wadToNum(rep.startPrice);
  const pf = wadToNum(rep.finalPrice);
  const positions = rep.positions.map((t): ClassifiedPosition => {
    const debtUsd = wadToNum(t.debt0);
    const otherUsd = wadToNum(t.other);
    const collTokens = wadToNum(t.coll0);
    const liqPrice = wadToNum(t.liqPrice0);
    const finalDebtUsd = wadToNum(t.debt);
    const finalColl = wadToNum(t.coll);
    const outcome: PositionOutcome = t.end === "bad-debt" ? "bad-debt" : t.end === "stuck" ? "stuck" : t.events > 0 ? "liquidated" : "safe";
    return {
      index: t.index,
      outcome,
      eMode: book.positions[t.index].eMode,
      ltBps: t.ltBps,
      bonusBps: t.bonusBps,
      debtUsd,
      collateralTokens: collTokens,
      collateralUsd: collTokens * p0,
      otherCollateralUsd: otherUsd,
      healthFactor: hfOf(collTokens * p0, otherUsd, t.ltBps, debtUsd),
      liquidationPrice: liqPrice,
      thresholdDrop: liqPrice > 0 ? 1 - liqPrice / p0 : null,
      liquidationEvents: t.events,
      repaidUsd: wadToNum(t.repaid),
      seizedTokens: wadToNum(t.seized),
      firstLiquidationStep: t.firstStep,
      finalDebtUsd,
      finalCollateralTokens: finalColl,
      finalHealthFactor: finalDebtUsd > 0 ? hfOf(finalColl * pf, otherUsd, t.ltBps, finalDebtUsd) : null,
      shortfallUsd: wadToNum(t.shortfall),
    };
  });
  const counts: Record<PositionOutcome, number> = { "bad-debt": 0, stuck: 0, liquidated: 0, safe: 0 };
  for (const p of positions) counts[p.outcome]++;
  return {
    consistent: true,
    bookId,
    positions,
    counts,
    belowThreshold: counts["bad-debt"] + counts.stuck,
    everLiquidated: positions.filter((p) => p.liquidationEvents > 0).length,
  };
}

/** Whether per-position tiles can be read for a run (real books up to BOOK_READ_MAX positions). */
export const canClassify = (s: Scenario): boolean => s.assetId < CALIBRATED && s.maxPositions <= BOOK_READ_MAX;

export type { PositionEnd };
