import { describe, expect, it } from "vitest";
import { CURVE_SHOCKS_BPS } from "@/lib/chain/scenario";
import { wadToNum } from "@/lib/kaskad/format";
import { VIZ_CURVE } from "./__fixtures__/load";
import { curveFromChain, curveGeometry, nearestIndex } from "./curve-model";
import { vizFormats } from "./format";

const data = curveFromChain(VIZ_CURVE, VIZ_CURVE.shocksBps);
const f = vizFormats();

describe("curveFromChain", () => {
  it("turns the recorded previewCurve into USD per shock level, both oracle modes", () => {
    expect(VIZ_CURVE.shocksBps).toEqual(CURVE_SHOCKS_BPS);
    expect(data.shocks).toEqual(CURVE_SHOCKS_BPS.map((b) => b / 10_000));
    expect(data.pool).toEqual(VIZ_CURVE.pool.bad.map(wadToNum));
    expect(data.external).toEqual(VIZ_CURVE.external.bad.map(wadToNum));
  });

  it("shows the recorded shape: the pool oracle loses from 3 %, the external one only from 10 %", () => {
    const firstLoss = (vs: readonly number[]) => data.shocks[vs.findIndex((v) => v > 0)];
    expect(firstLoss(data.pool)).toBe(0.03);
    expect(firstLoss(data.external)).toBe(0.1);
  });
});

describe("curveGeometry", () => {
  const g = curveGeometry(data, f.pctTick);

  it("spreads the shock levels on a log axis from edge to edge", () => {
    const xs = g.xTicks.map((t) => t.x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(1);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // 1 % sits at log(1/0.1)/log(30/0.1) of the width.
    expect(g.x(0.01)).toBeCloseTo(Math.log(10) / Math.log(300), 3);
  });

  it("puts 0 on the baseline and the largest value under the nice maximum", () => {
    expect(g.points.pool[0].y).toBeCloseTo(1, 5);
    expect(g.yMax).toBeGreaterThanOrEqual(Math.max(...data.pool));
    expect(Math.min(...g.points.pool.map((p) => p.y))).toBeGreaterThan(0);
    expect(g.yTicks[0]).toEqual({ value: 0, y: 1 });
    expect(g.allZero).toBe(false);
  });

  it("draws both series with rounded paths", () => {
    for (const d of [g.paths.external, g.paths.pool]) {
      expect(d.startsWith("M")).toBe(true);
      expect(Math.max(0, ...(d.match(/\d+\.(\d+)/g) ?? []).map((n) => n.split(".")[1].length))).toBeLessThanOrEqual(2);
    }
  });

  it("says so when there is no bad debt at all", () => {
    const zero = curveGeometry({ shocks: data.shocks, external: data.shocks.map(() => 0), pool: data.shocks.map(() => 0) }, f.pctTick);
    expect(zero.allZero).toBe(true);
    expect(zero.yMax).toBe(1);
  });

  it("finds the shock level nearest to a pointer position", () => {
    const xs = g.xTicks.map((t) => t.x);
    expect(nearestIndex(xs, 0)).toBe(0);
    expect(nearestIndex(xs, 1)).toBe(xs.length - 1);
    expect(nearestIndex(xs, xs[3] + 0.001)).toBe(3);
  });
});
