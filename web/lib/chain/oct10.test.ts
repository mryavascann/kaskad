import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockUrl, isStable, OCT10, otherCollateralUsd, undefended } from "./oct10";

describe("10 October replay data", () => {
  it("is the copy of scripts/data/oct10-replay.json", () => {
    const src = JSON.parse(readFileSync(join(__dirname, "../../../scripts/data/oct10-replay.json"), "utf8"));
    expect(OCT10).toEqual(src);
  });

  it("adds up: the misses explain the gap between predicted and actual", () => {
    const { both, onlyPredicted, onlyActual, why } = OCT10.match;
    expect(both.positions + onlyPredicted.positions).toBe(OCT10.predicted.positions);
    expect(both.positions + onlyActual.positions).toBe(OCT10.actual.positionsInBook);
    const w = why.onlyPredicted;
    expect(w.defended.positions + w.unliquidated.positions + w.model.positions).toBe(onlyPredicted.positions);
    expect(w.defended.predictedUsd + w.unliquidated.predictedUsd + w.model.predictedUsd).toBeCloseTo(onlyPredicted.predictedUsd, -1);
    expect(Object.values(why.onlyActualSeized).reduce((s, x) => s + x, 0)).toBeCloseTo(onlyActual.actualUsd, -1);
  });

  it("headline: undefended positions, predicted against actual", () => {
    const u = undefended();
    expect(u.actualUsd).toBe(OCT10.actual.liquidatedUsdInBook);
    expect(u.predictedUsd).toBe(OCT10.match.both.predictedUsd + OCT10.match.why.onlyPredicted.unliquidated.predictedUsd + OCT10.match.why.onlyPredicted.model.predictedUsd);
    expect(u.diff).toBeCloseTo((u.predictedUsd - u.actualUsd) / u.actualUsd, 10);
  });

  it("other collateral excludes the shocked asset; stablecoins are named apart", () => {
    // Each seized total is rounded to the dollar on its own: equal up to a few dollars.
    expect(Math.abs(otherCollateralUsd() - (OCT10.match.onlyActual.actualUsd - (OCT10.match.why.onlyActualSeized as Record<string, number>).WETH))).toBeLessThan(10);
    expect(isStable("USDC")).toBe(true);
    expect(isStable("cbBTC")).toBe(false);
    expect(blockUrl(23_549_825)).toBe("https://etherscan.io/block/23549825");
  });
});
