import { describe, expect, it } from "vitest";
import { wadToNum } from "@/lib/kaskad/format";
import { vizRun } from "./__fixtures__/data";
import { blockX } from "./geometry";
import { LANES, MIN_MARK, VIEW, majorEvery, penY, timelineFacts, timelineGeometry } from "./timeline-model";

const sali = vizRun("sali");
const worst = vizRun("worst");
const decimals = (d: string) => Math.max(0, ...(d.match(/\d+\.(\d+)/g) ?? []).map((n) => n.split(".")[1].length));

describe("timelineFacts", () => {
  it("summarises the recorded syrupUSDC −3 % run exactly as the chain reported it", () => {
    const f = timelineFacts(sali.timeline);
    expect(f.steps).toBe(20);
    expect(f.liquidations).toBe(sali.run.result.liquidations);
    expect(f.waves).toBe(sali.run.result.rounds);
    expect(f.firstStep).toBe(7);
    expect(f.lastActiveStep).toBe(7);
    expect(f.stalled).toBe(true);
    expect(f.peak?.step).toBe(7);
    expect(f.liquidated).toBeCloseTo(wadToNum(sali.run.result.totalLiquidated), 0);
    expect(f.startPrice).toBeCloseTo(wadToNum(sali.run.result.startPrice), 5);
    expect(f.endPrice).toBeCloseTo(wadToNum(sali.run.result.finalPrice), 5);
    expect(f.change).toBeCloseTo(-sali.shock, 4);
  });

  it("reports the pool-price spiral: no stall, liquidations until the last block", () => {
    const f = timelineFacts(worst.timeline);
    expect(f.stalled).toBe(false);
    expect(f.liquidations).toBe(worst.run.result.liquidations);
    expect(f.waves).toBe(worst.run.result.rounds);
    expect(f.lastActiveStep).toBe(20);
  });
});

describe("timelineGeometry", () => {
  it("draws one bar per block with liquidations, centred on its block, inside the lane", () => {
    const g = timelineGeometry(sali.timeline, "console");
    expect(g.marks).toHaveLength(1);
    const bar = g.marks[0];
    expect(bar.step).toBe(7);
    expect(bar.x).toBeCloseTo(blockX(7, 20) * VIEW.w, 1);
    // The only bar is the peak: it fills the lane.
    expect(bar.y + bar.height).toBeCloseTo(LANES.console.liqBottom * VIEW.h, 5);
    expect(bar.height).toBeCloseTo((LANES.console.liqBottom - LANES.console.liqTop) * VIEW.h, 1);
    expect(bar.sev).toBe(4);
  });

  it("scales bars to the peak block and ramps severity with size", () => {
    const g = timelineGeometry(worst.timeline, "console");
    expect(g.marks).toHaveLength(worst.timeline.points.filter((p) => p.liquidations > 0).length);
    const heights = g.marks.map((m) => m.height);
    expect(Math.max(...heights)).toBeCloseTo((LANES.console.liqBottom - LANES.console.liqTop) * VIEW.h, 1);
    expect(g.marks.every((m) => m.height >= MIN_MARK)).toBe(true);
    expect(new Set(g.marks.map((m) => m.sev)).size).toBeGreaterThan(1);
  });

  it("draws the trace variant as symmetric spikes around the baseline", () => {
    const g = timelineGeometry(worst.timeline, "trace");
    const base = LANES.trace.baseline * VIEW.h;
    for (const m of g.marks) expect(m.y + m.height / 2).toBeCloseTo(base, 1);
    expect(g.baselines).toEqual([base]);
  });

  it("keeps the price path rounded to 2 decimals (hydration-safe) and one point per block", () => {
    const g = timelineGeometry(worst.timeline, "console");
    expect(g.pricePoints).toHaveLength(21);
    expect(decimals(g.pricePath)).toBeLessThanOrEqual(2);
    // Highest price at the top of the price lane, lowest at its bottom.
    const ys = g.pricePoints.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(LANES.console.priceTop * VIEW.h, 1);
    expect(Math.max(...ys)).toBeCloseTo(LANES.console.priceBottom * VIEW.h, 1);
  });

  it("marks the colour phases: first liquidation and the start of the stall", () => {
    const g = timelineGeometry(sali.timeline, "console");
    expect(g.phase.first).toBeCloseTo(blockX(7, 20), 3);
    expect(g.phase.stall).toBeCloseTo(8 / 21, 3);
    expect(timelineGeometry(worst.timeline, "console").phase.stall).toBeNull();
  });

  it("gives the same numbers every time (no randomness)", () => {
    expect(timelineGeometry(worst.timeline, "trace")).toEqual(timelineGeometry(worst.timeline, "trace"));
  });
});

describe("penY and ticks", () => {
  it("interpolates the pen along the price path and clamps at the ends", () => {
    const g = timelineGeometry(sali.timeline, "console");
    const pts = g.pricePoints;
    expect(penY(pts, 0)).toBeCloseTo(pts[0][1] / VIEW.h);
    expect(penY(pts, 1)).toBeCloseTo(pts[20][1] / VIEW.h);
    const mid = penY(pts, blockX(10, 20));
    expect(mid).toBeCloseTo(pts[10][1] / VIEW.h, 3);
    expect(penY([], 0.5)).toBe(0.5);
  });

  it("labels about five blocks", () => {
    expect(majorEvery(5)).toBe(1);
    expect(majorEvery(10)).toBe(2);
    expect(majorEvery(20)).toBe(5);
    expect(majorEvery(50)).toBe(10);
    expect(majorEvery(100)).toBe(20);
  });
});
