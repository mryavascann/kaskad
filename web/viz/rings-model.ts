/**
 * PositionRings geometry ("epicenter" view): every position is a dot whose distance from the center
 * is the price drop at which it becomes liquidatable (`thresholdDrop`), whose area is its debt, and
 * whose angle is fixed by its book index (golden angle), so the layout never changes between runs,
 * renders and machines. Pure; rounded.
 */
import { round } from "./geometry";
import { maxDebt, type VizPosition } from "./positions";

/** Square viewBox. */
export const RINGS_VIEW = 400;
const C = RINGS_VIEW / 2;
/** Radius of the center (already liquidatable), of the last drop ring, and of the outer "beyond" band. */
export const R_CENTER = 16;
export const R_MAX = 160;
export const R_BEYOND = 184;
/** Dot radius for the smallest and the largest debt (area ∝ debt). */
export const DOT_MIN = 2.25;
export const DOT_MAX = 15;

/** 137.5°: consecutive indices land far apart, the whole circle fills evenly. */
export const GOLDEN_ANGLE = 180 * (3 - Math.sqrt(5));
/** Degrees on each side of 12 o'clock kept free of dots: the lane where the ring labels sit. */
export const LANE = 20;

const MAX_DROPS = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1] as const;
const RING_TICKS: Record<(typeof MAX_DROPS)[number], number[]> = {
  0.02: [0.005, 0.01, 0.02],
  0.05: [0.01, 0.02, 0.05],
  0.1: [0.01, 0.02, 0.05, 0.1],
  0.2: [0.01, 0.05, 0.1, 0.2],
  0.3: [0.01, 0.05, 0.1, 0.2, 0.3],
  0.5: [0.05, 0.1, 0.2, 0.5],
  1: [0.1, 0.25, 0.5, 1],
};

/** Outer drop ring: the first of 2 %, 5 %, 10 %, 20 %, 30 %, 50 %, 100 % that is at least 2.5 × the shock. */
export function ringDomain(shock: number): (typeof MAX_DROPS)[number] {
  return MAX_DROPS.find((d) => d >= shock * 2.5) ?? 1;
}

/** Radius of a price drop: square-root scale, so the crowded band near the shock gets more room. */
export function dropRadius(drop: number, maxDrop: number): number {
  if (!(drop > 0)) return R_CENTER;
  return round(R_CENTER + (R_MAX - R_CENTER) * Math.sqrt(Math.min(drop, maxDrop) / maxDrop));
}

export type RingDot = {
  index: number;
  /** Center in viewBox units. */
  cx: number;
  cy: number;
  r: number;
  /** Placed on the outer band: its threshold is beyond the last ring, or it is never liquidatable. */
  beyond: boolean;
};

export type RingsGeometry = {
  maxDrop: number;
  /** Drop rings with their radius. */
  rings: { drop: number; r: number }[];
  dots: RingDot[];
  /** Radius of the scenario's shock. */
  shockR: number;
};

export function ringsGeometry(positions: readonly VizPosition[], shock: number): RingsGeometry {
  const maxDrop = ringDomain(shock);
  const top = maxDebt(positions);
  const dots = positions.map((p): RingDot => {
    const beyond = p.thresholdDrop === null || p.thresholdDrop > maxDrop;
    const radius = beyond ? R_BEYOND : dropRadius(p.thresholdDrop ?? 0, maxDrop);
    const angle = (LANE + ((p.index * GOLDEN_ANGLE) % 360) * ((360 - 2 * LANE) / 360)) * (Math.PI / 180);
    const size = top > 0 ? DOT_MIN + (DOT_MAX - DOT_MIN) * Math.sqrt(Math.max(0, p.debtUsd) / top) : DOT_MIN;
    return {
      index: p.index,
      cx: round(C + radius * Math.sin(angle)),
      cy: round(C - radius * Math.cos(angle)),
      r: round(size),
      beyond,
    };
  });
  // Big dots first, so small ones stay visible on top.
  dots.sort((a, b) => b.r - a.r || a.index - b.index);
  return {
    maxDrop,
    rings: RING_TICKS[maxDrop].map((drop) => ({ drop, r: dropRadius(drop, maxDrop) })),
    dots,
    shockR: dropRadius(shock, maxDrop),
  };
}
