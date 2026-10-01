/**
 * WaveTimeline geometry and facts from `cascadeTimeline()` (lib/chain/timeline). Pure; everything is
 * rounded. The SVG uses a fixed viewBox stretched to the plot (preserveAspectRatio="none"), so these
 * numbers are the same on the server and in the browser whatever the width.
 */
import { line } from "d3-shape";
import type { BlockPoint } from "@/lib/chain/timeline";
import { blockX, round } from "./geometry";

export type TimelineInput = {
  /** One point per block 0..steps (cascadeTimeline().points). */
  points: readonly BlockPoint[];
  /** Liquidations stopped before the last block while debt stayed stuck. */
  stalled: boolean;
  /** Last block with a liquidation (0 = none). */
  lastActiveStep: number;
};

export type TimelineVariant = "console" | "trace";

/** viewBox of the plot. x: 0..W across the blocks, y: 0..H down. */
export const VIEW = { w: 1000, h: 300 } as const;

/** Vertical layout per variant, as fractions of the plot height. */
export const LANES = {
  console: { priceTop: 0.12, priceBottom: 0.56, liqTop: 0.7, liqBottom: 1 },
  trace: { priceTop: 0.08, priceBottom: 0.3, baseline: 0.66, amplitude: 0.3 },
} as const;

/** A nonzero amount is never drawn thinner than this (viewBox units), so an event is never invisible. */
export const MIN_MARK = 2.5;
/** Bar width as a share of one block. */
export const BAR_SHARE = 0.56;

export type Severity = 2 | 3 | 4;

export type TimelineMark = {
  step: number;
  /** Center x in viewBox units. */
  x: number;
  /** Bars: top-left and size. Spikes: y is the top, height the full up-and-down length. */
  y: number;
  width: number;
  height: number;
  liquidated: number;
  liquidations: number;
  waves: number;
  /** Severity ramp step (sev-2 … sev-4) by size relative to the peak block. */
  sev: Severity;
};

export type TimelineFacts = {
  steps: number;
  startPrice: number;
  endPrice: number;
  /** endPrice / startPrice − 1 (negative for a drop). */
  change: number;
  liquidations: number;
  waves: number;
  activeBlocks: number;
  /** USD liquidated over the whole run. */
  liquidated: number;
  firstStep: number | null;
  lastActiveStep: number;
  stalled: boolean;
  peak: { step: number; liquidated: number } | null;
};

export function timelineFacts(input: TimelineInput): TimelineFacts {
  const { points } = input;
  const steps = Math.max(0, points.length - 1);
  let liquidations = 0;
  let waves = 0;
  let activeBlocks = 0;
  let liquidated = 0;
  let firstStep: number | null = null;
  let peak: TimelineFacts["peak"] = null;
  for (const p of points) {
    liquidations += p.liquidations;
    waves += p.waves;
    liquidated += p.liquidated;
    if (p.liquidations > 0) {
      activeBlocks++;
      firstStep ??= p.step;
    }
    if (p.liquidated > 0 && (!peak || p.liquidated > peak.liquidated)) peak = { step: p.step, liquidated: p.liquidated };
  }
  const startPrice = points[0]?.price ?? 0;
  const endPrice = points[steps]?.price ?? startPrice;
  return {
    steps,
    startPrice,
    endPrice,
    change: startPrice > 0 ? endPrice / startPrice - 1 : 0,
    liquidations,
    waves,
    activeBlocks,
    liquidated,
    firstStep,
    lastActiveStep: input.lastActiveStep,
    stalled: input.stalled,
    peak,
  };
}

export type TimelineGeometry = {
  steps: number;
  facts: TimelineFacts;
  /** Price path `d`. */
  pricePath: string;
  /** Price points in viewBox units (x, y), one per block. */
  pricePoints: readonly (readonly [number, number])[];
  /** Bars (console) or spikes (trace), blocks with a nonzero amount only. */
  marks: TimelineMark[];
  /** Horizontal lines: lane baselines (console) or the seismograph baseline (trace), viewBox y. */
  baselines: number[];
  /** x (0–1) where the color changes: first liquidation, and where a stall begins. */
  phase: { first: number | null; stall: number | null };
};

const severity = (share: number): Severity => (share >= 2 / 3 ? 4 : share >= 1 / 3 ? 3 : 2);

export function timelineGeometry(input: TimelineInput, variant: TimelineVariant): TimelineGeometry {
  const facts = timelineFacts(input);
  const { steps } = facts;
  const { w, h } = VIEW;
  const x = (step: number) => round(blockX(step, steps) * w);
  const prices = input.points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const lane = variant === "console" ? LANES.console : LANES.trace;
  const top = lane.priceTop * h;
  const bottom = lane.priceBottom * h;
  const y = (price: number) => round(hi > lo ? bottom - ((price - lo) / (hi - lo)) * (bottom - top) : (top + bottom) / 2);

  const pricePoints = input.points.map((p) => [x(p.step), y(p.price)] as const);
  const pricePath = line().digits(2)(pricePoints.map(([px, py]) => [px, py])) ?? "";

  const peak = facts.peak?.liquidated ?? 0;
  const blockWidth = w / (steps + 1);
  const marks: TimelineMark[] = [];
  for (const p of input.points) {
    if (!(p.liquidated > 0) && p.liquidations === 0) continue;
    const share = peak > 0 ? p.liquidated / peak : 0;
    if (variant === "console") {
      const { liqTop, liqBottom } = LANES.console;
      const height = round(Math.max(MIN_MARK, share * (liqBottom - liqTop) * h));
      const width = round(Math.max(MIN_MARK, blockWidth * BAR_SHARE));
      marks.push({
        step: p.step,
        x: x(p.step),
        y: round(liqBottom * h - height),
        width,
        height,
        liquidated: p.liquidated,
        liquidations: p.liquidations,
        waves: p.waves,
        sev: severity(share),
      });
    } else {
      const { baseline, amplitude } = LANES.trace;
      const a = Math.max(MIN_MARK, share * amplitude * h);
      marks.push({
        step: p.step,
        x: x(p.step),
        y: round(baseline * h - a),
        width: 0,
        height: round(2 * a),
        liquidated: p.liquidated,
        liquidations: p.liquidations,
        waves: p.waves,
        sev: severity(share),
      });
    }
  }

  const baselines = variant === "console" ? [round(LANES.console.priceBottom * h), round(LANES.console.liqBottom * h)] : [round(LANES.trace.baseline * h)];
  const first = facts.firstStep === null ? null : round(blockX(facts.firstStep, steps), 4);
  const stall = facts.stalled ? round((facts.lastActiveStep + 1) / (steps + 1), 4) : null;
  return { steps, facts, pricePath, pricePoints, marks, baselines, phase: { first, stall } };
}

/**
 * Where the pen is on the price path at horizontal progress `t` (0–1 of the plot width): y as a
 * 0–1 fraction of the plot height, linear between block points. For the drawing needle.
 */
export function penY(points: readonly (readonly [number, number])[], t: number): number {
  if (!points.length) return 0.5;
  const px = t * VIEW.w;
  if (px <= points[0][0]) return points[0][1] / VIEW.h;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (px <= x1) {
      const [x0, y0] = points[i - 1];
      const k = x1 > x0 ? (px - x0) / (x1 - x0) : 1;
      return (y0 + (y1 - y0) * k) / VIEW.h;
    }
  }
  return points[points.length - 1][1] / VIEW.h;
}

/** Major tick interval for a run of `steps` blocks: about five labelled ticks. */
export function majorEvery(steps: number): number {
  if (steps <= 6) return 1;
  if (steps <= 12) return 2;
  if (steps <= 30) return 5;
  if (steps <= 60) return 10;
  return 20;
}
