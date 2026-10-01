/**
 * The shock scene's replay, pure: the state at one whole block of the recorded preview, the sound
 * cue for a block change, and the scroll beats. Server-safe; the live readouts use it in the browser.
 */
import type { Cue } from "@/audio/engine";
import type { LandingFinding, LandingPositions } from "./data";

/** Beats of the scene, as fractions of the scroll track. */
export const BEATS = {
  introOut: [0.015, 0.13],
  panelIn: [0.11, 0.19],
  loop: [0.2, 0.62],
} as const;

/** What the replay needs of the per-position read: when each position crosses its threshold, and the book size. */
export type ReplayBook = Pick<LandingPositions, "crossBlocks" | "total">;

/** The part of `LandingPositions` the live readouts get (not the hero's dominoes). */
export function replayBook(positions: LandingPositions | null): ReplayBook | null {
  return positions ? { crossBlocks: positions.crossBlocks, total: positions.total } : null;
}

/** The replay state at one whole block, derived from the recorded preview only. */
export function replayAt(finding: LandingFinding, positions: Pick<LandingPositions, "crossBlocks"> | null, block: number) {
  const k = Math.max(0, Math.min(finding.steps, Math.floor(block)));
  const price = finding.prices[k] ?? finding.finalPrice;
  const waves = finding.waves.filter((w) => w.step <= k);
  const under = positions ? positions.crossBlocks.filter((b) => b !== null && b <= k).length : null;
  const lastWaveStep = finding.waves.length ? finding.waves[finding.waves.length - 1].step : 0;
  return {
    block: k,
    price,
    drop: finding.startPrice > 0 ? 1 - price / finding.startPrice : 0,
    waves,
    latest: waves.length ? waves[waves.length - 1] : null,
    liquidatedUsd: waves.reduce((s, w) => s + w.liquidatedUsd, 0),
    under,
    /**
     * Liquidations stopped and debt stays stuck: said once the run is well past its last wave (two
     * blocks later, and not before 70 % of the path), while positions keep crossing the threshold.
     */
    stalled: finding.stuckDebtUsd > 0 && k >= Math.min(finding.steps, Math.max(lastWaveStep + 2, Math.ceil(finding.steps * 0.7))),
  };
}

/**
 * The cue for scrolling the replay from block `from` to block `to`: "boom" when it reaches the first
 * liquidation block, "tick" when the wave counter advances past it, nothing going back or standing.
 */
export function waveCue(finding: LandingFinding, from: number, to: number): Cue | null {
  if (to <= from) return null;
  const before = finding.waves.filter((w) => w.step <= from).length;
  const after = finding.waves.filter((w) => w.step <= to).length;
  if (after === before) return null;
  return before === 0 ? "boom" : "tick";
}
