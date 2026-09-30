/**
 * Chain data → hero positions. One domino per classified position, ordered by distance to
 * liquidation; each one that the run hits tips in the block in which the price crossed its
 * liquidation price, and flashes red in the block of its first liquidation. Only the recorded
 * result is replayed: outcomes, blocks and debts come from `classifyPositions`, never from here.
 * Pure and server-safe (compute it on the server and pass the plain result to the client).
 */
import type { ClassifiedPosition } from "@/lib/chain/book";
import type { Result, Scenario } from "@/lib/chain/types";
import { wadToNum } from "@/lib/kaskad/format";
import { clamp } from "@/motion/easing";
import { LAST_TIP, type HeroPosition } from "./model";

/**
 * Maps the timeline progress (0–1) to engine blocks. Block k is the k-th step of the price path
 * (0 = before the shock); the timeline runs a little past the last block so the last falls settle.
 */
export type HeroTimeline = {
  /** Blocks in the run (`Scenario.steps`). */
  steps: number;
  /** Final depeg in bps (`Scenario.shockBps`). */
  shockBps: number;
  /** Continuous block at progress 0. */
  startBlock: number;
  /** Continuous block at progress 1 (≥ `steps`). */
  endBlock: number;
};

export type HeroData = { positions: HeroPosition[]; timeline: HeroTimeline };

/**
 * Where the timeline starts. `first-tip`: half a block before the first domino tips, so the cascade
 * starts with the first scroll (the landing). `shock`: at block 0, before the price moves.
 */
export type TimelineStart = "first-tip" | "shock";

/** Lead before the first tip when the timeline starts at the first tip (blocks). */
export const TIP_LEAD_BLOCKS = 0.5;
/** Delay between dominoes that tip in the same block (blocks), shrunk so a block's tips fit in `BLOCK_SPREAD`. */
export const STAGGER_BLOCKS = 0.16;
export const BLOCK_SPREAD = 0.8;

/** Distance to liquidation used for the row order: the price drop at which the position becomes liquidatable. */
const distance = (p: ClassifiedPosition) => p.thresholdDrop ?? Infinity;

/** Price per block: the straight-line path, lowered to the logged oracle price where a wave ran (pool oracle). */
function blockPrices(scenario: Scenario, result: Result | undefined): number[] | null {
  if (!result) return null;
  const start = wadToNum(result.startPrice);
  const prices = Array.from({ length: scenario.steps + 1 }, (_, k) => start * (1 - (scenario.shockBps / 10_000) * (k / scenario.steps)));
  for (const wave of result.log) {
    if (wave.step >= 1 && wave.step <= scenario.steps) prices[wave.step] = Math.min(prices[wave.step], wadToNum(wave.priceWad));
  }
  return prices;
}

/**
 * Block in which the price first sits below the position's liquidation price (the engine liquidates
 * when `liquidationPrice > price`). From the logged prices when `prices` is given, else from the
 * straight-line path (exact for the external oracle, an upper bound when the oracle follows the pool).
 */
function crossingBlock(p: ClassifiedPosition, scenario: Scenario, prices: number[] | null): number {
  if (p.thresholdDrop === null) return scenario.steps;
  if (p.thresholdDrop <= 0) return 1;
  if (prices && p.liquidationPrice > 0) {
    for (let k = 1; k <= scenario.steps; k++) if (prices[k] < p.liquidationPrice) return k;
  }
  const blocksPerDrop = (scenario.steps * 10_000) / scenario.shockBps;
  return Math.min(scenario.steps, Math.max(1, Math.floor(p.thresholdDrop * blocksPerDrop) + 1));
}

/**
 * Hero positions and timeline for a classified run. `positions` come from a consistent
 * `classifyPositions()`; `result` (the on-chain preview) refines crossing blocks with the logged
 * oracle prices. Returns positions in row order (`order` = index).
 */
export function heroFromClassification(
  positions: readonly ClassifiedPosition[],
  scenario: Scenario,
  { result, start = "first-tip" }: { result?: Result; start?: TimelineStart } = {},
): HeroData {
  const sorted = [...positions].sort((a, b) => distance(a) - distance(b) || a.index - b.index);
  const moves = scenario.shockBps > 0 && scenario.steps > 0;
  const prices = moves ? blockPrices(scenario, result) : null;

  // Crossing block per domino that tips; a lower threshold never crosses later than a higher one.
  const crossing = sorted.map((p) => {
    if (!moves || p.outcome === "safe") return null;
    const linear = crossingBlock(p, scenario, prices);
    return p.firstLiquidationStep === null ? linear : Math.min(linear, p.firstLiquidationStep);
  });
  let earliest = Infinity;
  for (let i = crossing.length - 1; i >= 0; i--) {
    const k = crossing[i];
    if (k === null) continue;
    earliest = Math.min(earliest, k);
    crossing[i] = earliest;
  }

  // Tip time in blocks: the crossing block, staggered within the block in row order.
  const perBlock = new Map<number, number>();
  for (const k of crossing) if (k !== null) perBlock.set(k, (perBlock.get(k) ?? 0) + 1);
  const seen = new Map<number, number>();
  const tipBlock = crossing.map((k) => {
    if (k === null) return null;
    const j = seen.get(k) ?? 0;
    seen.set(k, j + 1);
    const count = perBlock.get(k) ?? 1;
    return k + j * Math.min(STAGGER_BLOCKS, BLOCK_SPREAD / count);
  });
  const hitBlock = sorted.map((p, i) => {
    const tip = tipBlock[i];
    if (tip === null || p.firstLiquidationStep === null) return null;
    return Math.max(tip, p.firstLiquidationStep);
  });
  const blocksPerDrop = moves ? (scenario.steps * 10_000) / scenario.shockBps : Infinity;
  const thresholdBlock = sorted.map((p, i) => {
    if (!moves || p.thresholdDrop === null || p.thresholdDrop >= 1) return null;
    const linear = Math.max(0, p.thresholdDrop * blocksPerDrop);
    const tip = tipBlock[i];
    return tip === null ? linear : Math.min(linear, tip);
  });

  const tips = tipBlock.filter((b): b is number => b !== null);
  const hits = hitBlock.filter((b): b is number => b !== null);
  const startBlock = start === "first-tip" && tips.length ? Math.max(0, Math.min(...tips) - TIP_LEAD_BLOCKS) : 0;
  const lastTip = tips.length ? Math.max(...tips) : startBlock;
  const lastHit = hits.length ? Math.max(...hits) : startBlock;
  // Long enough to reach the final price, to start the last tip by LAST_TIP (so it settles by 1)
  // and to show the last liquidation.
  const span = Math.max(scenario.steps - startBlock, (lastTip - startBlock) / LAST_TIP, lastHit - startBlock, 1e-9);
  const timeline: HeroTimeline = { steps: scenario.steps, shockBps: scenario.shockBps, startBlock, endBlock: startBlock + span };
  const toProgress = (block: number) => (block - startBlock) / span;

  return {
    timeline,
    positions: sorted.map((p, order) => {
      const tip = tipBlock[order];
      const hit = hitBlock[order];
      const threshold = thresholdBlock[order];
      const position: HeroPosition = {
        order,
        debtUsd: p.debtUsd,
        outcome: p.outcome,
        thresholdAt: threshold === null ? null : toProgress(threshold),
      };
      if (tip !== null) position.tipAt = clamp(toProgress(tip), 0, LAST_TIP);
      if (hit !== null) position.hitAt = clamp(toProgress(hit));
      return position;
    }),
  };
}

/** Continuous engine block at `progress`, clamped to [0, steps]. */
export function blockAt(timeline: HeroTimeline, progress: number): number {
  const block = timeline.startBlock + clamp(progress) * (timeline.endBlock - timeline.startBlock);
  return clamp(block, 0, timeline.steps);
}

/** Timeline progress at which `block` begins (may fall outside 0–1 for blocks before the start). */
export function progressAtBlock(timeline: HeroTimeline, block: number): number {
  const span = timeline.endBlock - timeline.startBlock;
  return span > 0 ? (block - timeline.startBlock) / span : 0;
}

/** Price drop of the straight-line path at `progress` (0.03 = −3 %), in whole blocks like the engine. */
export function dropAt(timeline: HeroTimeline, progress: number): number {
  return (timeline.shockBps / 10_000) * (Math.floor(blockAt(timeline, progress) + 1e-9) / timeline.steps);
}
