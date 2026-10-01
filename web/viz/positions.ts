/**
 * Per-position states for PositionTiles and PositionRings, from `classifyPositions()` (lib/chain/book).
 * Pure. The final outcome is the classification's; states before the end are derived from the same
 * run: the first liquidation block of each position and the oracle price of each block.
 */
import type { ClassifiedPosition, PositionOutcome } from "@/lib/chain/book";

export type { PositionOutcome };

/** The fields the charts read from a classified position. */
export type VizPosition = Pick<
  ClassifiedPosition,
  | "index"
  | "outcome"
  | "debtUsd"
  | "healthFactor"
  | "liquidationPrice"
  | "thresholdDrop"
  | "firstLiquidationStep"
  | "finalHealthFactor"
>;

/**
 * What a tile shows at a block:
 * - `pending`: nothing has happened to it yet (before the end of the run);
 * - `below`: the oracle price is under its liquidation price, no liquidation yet;
 * - `liquidated`: hit by a liquidation (from its first liquidation block);
 * - at the end, its final outcome: `bad-debt`, `stuck`, `liquidated` or `safe`.
 */
export type TileState = PositionOutcome | "pending" | "below";

/** Worst first. Legend order. */
export const TILE_STATES: readonly TileState[] = ["bad-debt", "stuck", "liquidated", "below", "pending", "safe"];
export const OUTCOMES: readonly PositionOutcome[] = ["bad-debt", "stuck", "liquidated", "safe"];

export type Replay = {
  /** Current block (0 = before the shock). Omit for the end state. */
  step?: number;
  /** Last block of the run (scenario.steps). */
  steps?: number;
  /** Oracle price per block (cascadeTimeline().points[i].price), for the `below` state. */
  prices?: readonly number[];
};

/** True when the replay shows the end of the run (no step, or step at / past the last block). */
export function atEnd({ step, steps }: Replay): boolean {
  return step === undefined || steps === undefined || step >= steps;
}

/**
 * Closest to liquidation first: threshold drop ascending (already liquidatable first, never
 * liquidatable last), then larger debt first, then book order. Stable and deterministic.
 */
export function byThreshold<T extends Pick<VizPosition, "index" | "thresholdDrop" | "debtUsd">>(positions: readonly T[]): T[] {
  const key = (p: T) => (p.thresholdDrop === null ? Infinity : p.thresholdDrop);
  return [...positions].sort((a, b) => key(a) - key(b) || b.debtUsd - a.debtUsd || a.index - b.index);
}

/** State of one position at the replay's block (see TileState). */
export function tileState(p: VizPosition, replay: Replay): TileState {
  if (atEnd(replay)) return p.outcome;
  const step = replay.step ?? 0;
  if (p.firstLiquidationStep !== null && step >= p.firstLiquidationStep) return "liquidated";
  const price = replay.prices?.[Math.max(0, Math.min(step, replay.prices.length - 1))];
  // HF < 1 exactly when the oracle price is under the liquidation price (other collateral is fixed;
  // an untouched position's state depends on the price alone).
  if (price !== undefined && p.liquidationPrice > 0 && price < p.liquidationPrice) return "below";
  return "pending";
}

export function stateCounts(positions: readonly VizPosition[], replay: Replay): Record<TileState, number> {
  const counts: Record<TileState, number> = { "bad-debt": 0, stuck: 0, liquidated: 0, below: 0, pending: 0, safe: 0 };
  for (const p of positions) counts[tileState(p, replay)]++;
  return counts;
}

/** States that can appear at this point of the replay (the legend shows these, with 0 counts too). */
export function visibleStates(replay: Replay, hasPrices: boolean): TileState[] {
  if (atEnd(replay)) return [...OUTCOMES];
  return hasPrices ? ["liquidated", "below", "pending"] : ["liquidated", "pending"];
}

/** First block whose oracle price is under the position's liquidation price; null if none. */
export function crossingStep(p: Pick<VizPosition, "liquidationPrice">, prices?: readonly number[]): number | null {
  if (!prices || !(p.liquidationPrice > 0)) return null;
  const i = prices.findIndex((price) => price < p.liquidationPrice);
  return i < 0 ? null : i;
}

/**
 * Flip order for positions that change together: those that cross their threshold in the same block,
 * are hit in the same block, or settle at the end go one after another, in the given order (closest
 * to liquidation first). Returns a rank per position (0, 1, 2 … within its group), capped at `max`.
 */
export function flipRanks(ordered: readonly VizPosition[], states: readonly TileState[], replay: Replay, max = 40): number[] {
  const end = atEnd(replay);
  const group = (p: VizPosition, state: TileState) => {
    if (state === "liquidated" && !end) return `hit:${p.firstLiquidationStep}`;
    if (state === "below") return `below:${crossingStep(p, replay.prices)}`;
    return `state:${state}`;
  };
  const seen = new Map<string, number>();
  return ordered.map((p, i) => {
    const key = group(p, states[i]);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return Math.min(n, max);
  });
}

/** Largest debt of the book (for dot and tile sizes); 0 when empty. */
export const maxDebt = (positions: readonly Pick<VizPosition, "debtUsd">[]) =>
  positions.reduce((m, p) => Math.max(m, p.debtUsd), 0);

/** Price drop (0–1) of the replay's block relative to block 0; null without prices. */
export function dropAt(replay: Replay): number | null {
  const prices = replay.prices;
  if (!prices?.length || !(prices[0] > 0)) return null;
  const step = atEnd(replay) ? prices.length - 1 : Math.max(0, Math.min(replay.step ?? 0, prices.length - 1));
  return Math.max(0, 1 - prices[step] / prices[0]);
}
