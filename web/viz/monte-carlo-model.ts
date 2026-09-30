/**
 * MonteCarloChart model: one dot per random price path (final shock vs bad debt), from
 * `monteCarloFacts()` (lib/chain/engine). Pure. Shock values arrive in percent (5.85 = 5.85 %), as
 * monteCarloFacts reports them.
 */
import { linearTicks, niceMax, round, thinLabels } from "./geometry";

/** The fields the chart reads; `monteCarloFacts(result)` has all of them. */
export type MonteCarloData = {
  paths: number;
  points: readonly { shockPct: number; badDebtUsd: number }[];
  meanBadDebtUsd: number;
  p95BadDebtUsd: number;
  worstBadDebtUsd: number;
  worstShockPct: number;
  meanShockPct: number;
  lossPaths: number;
  lossPathShare: number;
};

/** Headroom above the largest value, for the marker labels. */
const TOP = 0.14;

export type McDot = { i: number; x: number; y: number; loss: boolean; shockPct: number; badDebtUsd: number };

export type McGeometry = {
  /** Zero-loss dots first, loss dots on top. */
  dots: McDot[];
  /** 0–1 y of the mean and p95 lines; null when there is no bad debt at all. */
  meanY: number | null;
  p95Y: number | null;
  worst: { x: number; y: number } | null;
  yMax: number;
  xMaxPct: number;
  yTicks: { value: number; y: number }[];
  xTicks: { pct: number; x: number; hide: string | undefined }[];
};

export function mcGeometry(data: MonteCarloData, formatShock: (fraction: number) => string): McGeometry {
  const xMaxPct = niceMax(Math.max(0, ...data.points.map((p) => p.shockPct)), 5);
  const maxBad = Math.max(0, ...data.points.map((p) => p.badDebtUsd), data.worstBadDebtUsd);
  const yMax = niceMax(maxBad);
  const x = (pctValue: number) => round(Math.max(0, pctValue) / xMaxPct, 4);
  const y = (v: number) => round(1 - (Math.max(0, v) / yMax) * (1 - TOP), 4);

  const dots = data.points
    .map((p, i) => ({ i, x: x(p.shockPct), y: y(p.badDebtUsd), loss: p.badDebtUsd > 0, shockPct: p.shockPct, badDebtUsd: p.badDebtUsd }))
    .sort((a, b) => Number(a.loss) - Number(b.loss) || a.i - b.i);

  const any = maxBad > 0;
  const ticks = linearTicks(xMaxPct, 5);
  const hide = thinLabels(ticks.map((t) => ({ pos: t / xMaxPct, chars: formatShock(t / 100).length })));
  return {
    dots,
    meanY: any ? y(data.meanBadDebtUsd) : null,
    p95Y: any ? y(data.p95BadDebtUsd) : null,
    worst: any ? { x: x(data.worstShockPct), y: y(data.worstBadDebtUsd) } : null,
    yMax,
    xMaxPct,
    // Without any bad debt the axis is only its baseline: no invented $0.5 / $1 ticks.
    yTicks: (any ? linearTicks(yMax, 3) : [0]).map((value) => ({ value, y: y(value) })),
    xTicks: ticks.map((t, i) => ({ pct: t, x: x(t), hide: hide[i] })),
  };
}
