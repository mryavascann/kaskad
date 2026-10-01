import { describe, expect, it } from "vitest";
import { classifyPositions, type ClassifiedPosition } from "@/lib/chain/book";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { blockAt, dropAt, heroFromClassification, progressAtBlock, TIP_LEAD_BLOCKS } from "./data";
import { buildHeroModel, LAST_TIP } from "./model";

function classified(name: string) {
  const run = fixtureRun(name);
  const c = classifyPositions(run.book, run.result, run.scenario);
  if (!c.consistent) throw new Error(`${name}: replay did not reproduce the preview`);
  return { run, positions: c.positions };
}

const sali = classified("sali");
const worst = classified("worst");
const finding = heroFromClassification(sali.positions, sali.run.scenario, { result: sali.run.result });

const byOrder = (positions: readonly ClassifiedPosition[]) =>
  [...positions].sort((a, b) => (a.thresholdDrop ?? Infinity) - (b.thresholdDrop ?? Infinity) || a.index - b.index);

describe("heroFromClassification (syrupUSDC −3 %, the landing finding)", () => {
  const { positions, timeline } = finding;

  it("draws one domino per position, ordered by distance to liquidation", () => {
    expect(positions).toHaveLength(57);
    positions.forEach((p, i) => expect(p.order).toBe(i));
    const sorted = byOrder(sali.positions);
    positions.forEach((p, i) => {
      expect(p.debtUsd).toBe(sorted[i].debtUsd);
      expect(p.outcome).toBe(sorted[i].outcome);
    });
  });

  it("tips exactly the 30 stuck positions and never the 27 safe ones", () => {
    const tipping = positions.filter((p) => p.tipAt !== undefined);
    expect(tipping).toHaveLength(30);
    expect(tipping.every((p) => p.outcome === "stuck")).toBe(true);
    expect(positions.filter((p) => p.outcome === "safe" && p.tipAt === undefined)).toHaveLength(27);
    // Under the external oracle the stuck positions are exactly the 30 closest to liquidation.
    expect(positions.slice(0, 30).every((p) => p.outcome === "stuck")).toBe(true);
  });

  it("flashes the one partly liquidated position, in its liquidation block", () => {
    const hit = positions.filter((p) => p.hitAt !== undefined);
    expect(hit).toHaveLength(1);
    expect(hit[0].order).toBe(0);
    expect(hit[0].outcome).toBe("stuck");
    expect(Math.floor(blockAt(timeline, hit[0].hitAt ?? 0))).toBe(7);
    const source = byOrder(sali.positions)[0];
    expect(source.firstLiquidationStep).toBe(7);
    expect(source.liquidationEvents).toBe(1);
  });

  it("starts the timeline half a block before the first tip and reaches the final price", () => {
    expect(timeline.steps).toBe(20);
    expect(timeline.startBlock).toBe(7 - TIP_LEAD_BLOCKS);
    expect(timeline.endBlock).toBeGreaterThanOrEqual(timeline.steps);
    expect(positions[0].tipAt).toBeCloseTo(progressAtBlock(timeline, 7), 5);
    expect(dropAt(timeline, 1)).toBeCloseTo(0.03, 12);
    expect(dropAt(timeline, 0)).toBeCloseTo(0.03 * (6 / 20), 12);
  });

  it("tips in row order, each in the block where the price crosses its liquidation price", () => {
    const tips = positions.flatMap((p) => (p.tipAt === undefined ? [] : [p.tipAt]));
    for (let i = 1; i < tips.length; i++) expect(tips[i]).toBeGreaterThan(tips[i - 1]);
    expect(Math.max(...tips)).toBeLessThanOrEqual(LAST_TIP);
    const sorted = byOrder(sali.positions);
    positions.forEach((p, i) => {
      if (p.tipAt === undefined) return;
      const block = Math.floor(blockAt(timeline, p.tipAt) + 1e-9);
      const drop = sorted[i].thresholdDrop ?? 0;
      // Crossed in `block`: the straight-line drop is past the threshold there and not one block earlier.
      expect(0.03 * (block / 20)).toBeGreaterThan(drop);
      if (sorted[i].firstLiquidationStep === null) expect(0.03 * ((block - 1) / 20)).toBeLessThanOrEqual(drop);
    });
  });

  it("warms each domino up before its threshold, never after it tips", () => {
    positions.forEach((p) => {
      if (p.tipAt !== undefined) expect(p.thresholdAt ?? Infinity).toBeLessThanOrEqual(p.tipAt);
    });
    // Safe positions near the end of the path warm up by the last block; far ones never do.
    const safe = positions.filter((p) => p.outcome === "safe");
    expect(safe.some((p) => (p.thresholdAt ?? Infinity) < 1.05)).toBe(true);
    expect(safe.some((p) => (p.thresholdAt ?? 0) > 5)).toBe(true);
  });

  it("builds a model whose final pose leans the stuck row on the first safe domino", () => {
    const model = buildHeroModel(positions);
    expect(model.dominoes.filter((d) => d.rest > 0)).toHaveLength(30);
    expect(model.dominoes[30].rest).toBe(0);
    expect(model.dominoes[29].rest).toBeGreaterThan(0);
  });

  it("can start at the shock instead of the first tip", () => {
    const fromShock = heroFromClassification(sali.positions, sali.run.scenario, { result: sali.run.result, start: "shock" });
    expect(fromShock.timeline.startBlock).toBe(0);
    expect(fromShock.positions[0].tipAt).toBeCloseTo(progressAtBlock(fromShock.timeline, 7), 5);
  });

  it("with a lead, starts at block 0 (before the shock) and walks to the first-tip framing", () => {
    const led = heroFromClassification(sali.positions, sali.run.scenario, { result: sali.run.result, lead: 0.13 });
    const tl = led.timeline;
    expect(tl.lead).toBe(0.13);
    expect(blockAt(tl, 0)).toBe(0);
    expect(dropAt(tl, 0)).toBe(0);
    expect(blockAt(tl, 0.13)).toBeCloseTo(tl.startBlock, 9);
    expect(dropAt(tl, 1)).toBeCloseTo(0.03, 12);
    for (const block of [0, 2.5, 6.5, 7, 14.5, 20]) expect(blockAt(tl, progressAtBlock(tl, block))).toBeCloseTo(block, 9);
    // Same events, same blocks; the last tip still leaves room to settle.
    led.positions.forEach((p, i) => {
      const q = positions[i];
      if (q.tipAt === undefined) return expect(p.tipAt).toBeUndefined();
      expect(blockAt(tl, p.tipAt ?? 0)).toBeCloseTo(blockAt(timeline, q.tipAt), 6);
    });
    expect(Math.max(...led.positions.map((p) => p.tipAt ?? 0))).toBeLessThanOrEqual(LAST_TIP);
    // Nothing is under its threshold at rest (the external oracle crosses no one before block 7).
    expect(led.positions.every((p) => (p.thresholdAt ?? Infinity) > 0)).toBe(true);
  });

  it("puts each threshold on the whole block from which the price is under it", () => {
    positions.forEach((p) => {
      if (p.thresholdAt === null || p.thresholdAt === undefined) return;
      const block = blockAt(timeline, p.thresholdAt);
      if (block < timeline.steps) expect(block).toBeCloseTo(Math.round(block), 6);
    });
  });

  it("gives the same result without the logged prices under the external oracle", () => {
    const linear = heroFromClassification(sali.positions, sali.run.scenario);
    expect(linear.positions.map((p) => p.tipAt)).toEqual(positions.map((p) => p.tipAt));
  });
});

describe("heroFromClassification (pool oracle spiral)", () => {
  const { positions, timeline } = heroFromClassification(worst.positions, worst.run.scenario, { result: worst.run.result });

  it("tips the 56 bad-debt positions, in row order, and leaves the safe one", () => {
    const tips = positions.flatMap((p) => (p.tipAt === undefined ? [] : [p.tipAt]));
    expect(tips).toHaveLength(56);
    for (let i = 1; i < tips.length; i++) expect(tips[i]).toBeGreaterThanOrEqual(tips[i - 1]);
    expect(positions.filter((p) => p.outcome === "safe").every((p) => p.tipAt === undefined)).toBe(true);
  });

  it("uses the logged oracle prices: positions cross well before the straight-line path says", () => {
    const sorted = byOrder(worst.positions);
    const lateOnStraightLine = sorted.findIndex((p) => (p.thresholdDrop ?? 0) > 0.025 && p.outcome === "bad-debt");
    expect(lateOnStraightLine).toBeGreaterThan(0);
    const block = blockAt(timeline, positions[lateOnStraightLine].tipAt ?? 1);
    expect(block).toBeLessThan(Math.floor((sorted[lateOnStraightLine].thresholdDrop ?? 0) * (20 / 0.03)) + 1);
  });

  it("flashes liquidations no earlier than the tip", () => {
    for (const p of positions) if (p.hitAt !== undefined) expect(p.hitAt).toBeGreaterThanOrEqual(p.tipAt ?? 0);
    expect(positions.filter((p) => p.hitAt !== undefined).length).toBeGreaterThan(1);
  });
});

describe("timeline helpers", () => {
  const { timeline } = finding;

  it("maps progress to blocks and back", () => {
    for (const block of [7, 10, 14.5, 20]) expect(blockAt(timeline, progressAtBlock(timeline, block))).toBeCloseTo(block, 9);
    expect(blockAt(timeline, -1)).toBe(timeline.startBlock);
    expect(blockAt(timeline, 2)).toBe(timeline.steps);
  });

  it("does not move anything when there is no shock", () => {
    const flat = heroFromClassification(sali.positions, { ...sali.run.scenario, shockBps: 0 });
    expect(flat.positions.every((p) => p.tipAt === undefined && p.hitAt === undefined)).toBe(true);
    expect(flat.timeline.startBlock).toBe(0);
  });
});
