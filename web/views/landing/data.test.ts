import { describe, expect, it } from "vitest";
import { recordedLanding } from "./__fixtures__/landing-data";
import { crossBlock } from "./data";

describe("landing data from the recorded syrupUSDC −3 % preview", () => {
  const d = recordedLanding();

  it("maps the engine result to the finding", () => {
    const f = d.finding!;
    expect(f.symbol).toBe("syrupUSDC");
    expect(f.shock).toBeCloseTo(0.03);
    expect(f.oracle).toBe("external");
    expect(f.prices).toHaveLength(f.steps + 1);
    expect(f.prices[0]).toBeCloseTo(f.startPrice, 6);
    expect(f.prices[f.steps]).toBeCloseTo(f.finalPrice, 6);
    expect(f.gapRatio).toBeCloseTo(f.stuckDebtUsd / f.clearedUsd, 9);
    // Every wave the engine logged, numbered, and their repaid debt adds up to totalLiquidated.
    expect(f.waves.map((w) => w.n)).toEqual(f.waves.map((_, i) => i + 1));
    expect(f.waves.reduce((s, w) => s + w.liquidatedUsd, 0)).toBeCloseTo(f.clearedUsd, 2);
  });

  it("counts positions under the threshold per block, ending at the classification's count", () => {
    const p = d.positions!;
    const f = d.finding!;
    expect(p.crossBlocks).toHaveLength(p.total);
    const underAtEnd = p.crossBlocks.filter((b) => b !== null && b <= f.steps).length;
    expect(underAtEnd).toBe(p.belowThreshold + p.counts.liquidated);
    expect(p.hero.positions).toHaveLength(p.total);
  });

  it("finds the largest position by debt", () => {
    const p = d.positions!;
    expect(p.largest).not.toBeNull();
    expect(p.largest!.healthFactor).toBeGreaterThan(0);
  });

  it("feeds the gas gauge from the 10,000-position run", () => {
    const s = d.scale!;
    expect(s.positions).toBe(s.facts.positions);
    expect(s.facts.monad.fitsOneTx).toBe(true);
    expect(s.facts.ethereum.fitsOneTx).toBe(false);
  });
});

describe("crossBlock", () => {
  const prices = [1, 0.99, 0.98, 0.97];
  it("returns the first block whose price is under the liquidation price", () => {
    expect(crossBlock(prices, 0.985)).toBe(2);
    expect(crossBlock(prices, 1.5)).toBe(0);
    expect(crossBlock(prices, 0.5)).toBeNull();
    expect(crossBlock(prices, 0)).toBeNull();
  });
});
