import { describe, expect, it } from "vitest";
import { monteCarloFacts } from "@/lib/chain/engine";
import { vizMonteCarlo } from "./__fixtures__/load";
import { vizFormats } from "./format";
import { mcGeometry } from "./monte-carlo-model";

const f = vizFormats();
const worst = monteCarloFacts(vizMonteCarlo("worst").result);
const sali = monteCarloFacts(vizMonteCarlo("sali").result);

describe("mcGeometry on the recorded pool-price run (30 paths)", () => {
  const g = mcGeometry(worst, f.pctTick);

  it("draws one dot per path, the paths with bad debt on top", () => {
    expect(g.dots).toHaveLength(worst.paths);
    const firstLoss = g.dots.findIndex((d) => d.loss);
    expect(g.dots.slice(firstLoss).every((d) => d.loss)).toBe(true);
    expect(g.dots.filter((d) => d.loss)).toHaveLength(worst.lossPaths);
  });

  it("places mean and p95 lines and rings the worst path", () => {
    expect(g.meanY).not.toBeNull();
    expect(g.p95Y).not.toBeNull();
    expect(g.p95Y as number).toBeLessThan(g.meanY as number);
    expect(g.worst).not.toBeNull();
    // The worst path is the highest dot.
    expect(g.worst?.y).toBeCloseTo(Math.min(...g.dots.map((d) => d.y)), 4);
  });

  it("puts shocks on a 0-based axis that covers every path", () => {
    expect(g.xMaxPct).toBeGreaterThanOrEqual(Math.max(...worst.points.map((p) => p.shockPct)));
    expect(g.dots.every((d) => d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1)).toBe(true);
    expect(g.xTicks[0]).toMatchObject({ pct: 0, x: 0 });
  });
});

describe("mcGeometry on the recorded external-price run (100 paths, none loses)", () => {
  const g = mcGeometry(sali, f.pctTick);

  it("keeps every dot on the baseline and draws no reference lines", () => {
    expect(sali.lossPaths).toBe(0);
    expect(g.dots.every((d) => !d.loss && d.y === g.dots[0].y)).toBe(true);
    expect(g.meanY).toBeNull();
    expect(g.p95Y).toBeNull();
    expect(g.worst).toBeNull();
  });

  it("labels only the $0 baseline (no invented ticks)", () => {
    expect(g.yTicks.map((t) => t.value)).toEqual([0]);
  });
});
