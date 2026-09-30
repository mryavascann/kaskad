/**
 * StressCurve model: bad debt per shock level for the two oracle modes (lib/chain `previewCurve`).
 * Pure. x is a log scale (the app's shock levels span 0.1 % … 30 %), y is linear from 0.
 */
import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import { wadToNum } from "@/lib/kaskad/format";
import { linearTicks, niceMax, round, thinLabels } from "./geometry";

export type OracleSeries = "external" | "pool";
export const SERIES: readonly OracleSeries[] = ["external", "pool"];

export type CurveData = {
  /** Shock levels as fractions (0.03 = −3 %), ascending. */
  shocks: readonly number[];
  /** Bad debt (USD) per shock level, oracle following the external price (realistic). */
  external: readonly number[];
  /** Bad debt (USD) per shock level, oracle following the pool price (worst case). */
  pool: readonly number[];
};

/** `useStressCurve()` output → chart data (USD numbers, shocks as fractions). */
export function curveFromChain(
  curve: { external: { bad: readonly bigint[] }; pool: { bad: readonly bigint[] } },
  shocksBps: readonly number[],
): CurveData {
  return {
    shocks: shocksBps.map((bps) => bps / 10_000),
    external: curve.external.bad.map(wadToNum),
    pool: curve.pool.bad.map(wadToNum),
  };
}

/** viewBox of the plot (stretched). */
export const CURVE_VIEW = { w: 1000, h: 300 } as const;
/** Headroom above the largest value, as a share of the plot height, for the end labels. */
const TOP = 0.08;

export type CurveGeometry = {
  /** Point positions (0–1 of the plot) per series, one per shock level. */
  points: Record<OracleSeries, { x: number; y: number; value: number; shock: number }[]>;
  paths: Record<OracleSeries, string>;
  /** Largest value on the y axis (nice). */
  yMax: number;
  yTicks: { value: number; y: number }[];
  xTicks: { shock: number; x: number; hide: string | undefined }[];
  /** 0–1 x of an arbitrary shock (for markers). */
  x: (shock: number) => number;
  /** True when every value is 0: nothing to plot above the baseline. */
  allZero: boolean;
};

export function curveGeometry(data: CurveData, formatShock: (shock: number) => string): CurveGeometry {
  const { shocks } = data;
  const positive = shocks.length > 1 && shocks.every((s) => s > 0);
  const lo = shocks[0] ?? 0;
  const hi = shocks[shocks.length - 1] ?? 1;
  const xScale = positive
    ? scaleLog().domain([lo, hi]).range([0, 1]).clamp(true)
    : scaleLinear().domain([Math.min(0, lo), hi > lo ? hi : lo + 1]).range([0, 1]).clamp(true);
  const values = [...data.external, ...data.pool].filter((v) => Number.isFinite(v));
  const max = Math.max(0, ...values);
  const yMax = niceMax(max);
  const y = (v: number) => 1 - (Math.max(0, v) / yMax) * (1 - TOP);

  const series = (vs: readonly number[]) =>
    shocks.map((shock, i) => ({ shock, value: vs[i] ?? 0, x: round(xScale(shock), 4), y: round(y(vs[i] ?? 0), 4) }));
  const points = { external: series(data.external), pool: series(data.pool) };
  const path = (pts: { x: number; y: number }[]) =>
    line().digits(2)(pts.map((p) => [p.x * CURVE_VIEW.w, p.y * CURVE_VIEW.h] as [number, number])) ?? "";

  const labels = shocks.map((shock) => formatShock(shock));
  const hide = thinLabels(labels.map((label, i) => ({ pos: xScale(shocks[i]), chars: label.length })));
  return {
    points,
    paths: { external: path(points.external), pool: path(points.pool) },
    yMax,
    yTicks: linearTicks(yMax, 3).map((value) => ({ value, y: round(y(value), 4) })),
    xTicks: shocks.map((shock, i) => ({ shock, x: round(xScale(shock), 4), hide: hide[i] })),
    x: (shock: number) => round(xScale(shock), 4),
    allZero: max === 0,
  };
}

/** Index of the shock level nearest to horizontal position `x` (0–1 of the plot). */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  return best;
}
