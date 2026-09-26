import { describe, expect, it } from "vitest";
import { packPosition, unpackPosition, toUnits6, usdTo6 } from "./pack";
import {
  collateralToSurvive,
  depegToLiquidation,
  ethMemoryGas,
  healthFactor,
  monadMemoryGas,
  repayToSurvive,
  simulateGasLimit,
  monteCarloGasLimit,
  monCost,
} from "./math";
import { calibrateBook, realToPacked, type RealPosition } from "./calibrate";

describe("pack", () => {
  const p = {
    collateral: 123_456_789n,
    debt: 987_654_321n,
    otherColl: 4_000_000,
    collateralId: 9,
    ltBps: 9200,
    bonusBps: 400,
    eMode: 1,
  };

  it("round-trips", () => {
    expect(unpackPosition(packPosition(p))).toEqual(p);
  });

  it("round-trips extremes", () => {
    const max = {
      collateral: (1n << 88n) - 1n,
      debt: (1n << 88n) - 1n,
      otherColl: 2 ** 32 - 1,
      collateralId: 255,
      ltBps: 65535,
      bonusBps: 65535,
      eMode: 255,
    };
    expect(unpackPosition(packPosition(max))).toEqual(max);
    expect(packPosition(max)).toBe((1n << 256n) - 1n);
  });

  it("uses the Solidity bit layout", () => {
    const w = packPosition({ ...p, collateral: 1n, debt: 0n, otherColl: 0, ltBps: 0, bonusBps: 0, eMode: 0 });
    expect(w).toBe(1n | (9n << 208n));
    expect(packPosition({ ...p, collateral: 0n, debt: 1n, otherColl: 0, collateralId: 0, ltBps: 0, bonusBps: 0, eMode: 0 })).toBe(
      1n << 88n,
    );
  });

  it("rejects out-of-range fields", () => {
    expect(() => packPosition({ ...p, collateral: 1n << 88n })).toThrow(RangeError);
    expect(() => packPosition({ ...p, ltBps: 70000 })).toThrow(RangeError);
    expect(() => packPosition({ ...p, otherColl: -1 })).toThrow(RangeError);
    expect(() => packPosition({ ...p, otherColl: 1.5 })).toThrow(RangeError);
  });

  it("converts decimals", () => {
    expect(toUnits6(1_500_000_000_000_000_000n, 18)).toBe(1_500_000n);
    expect(toUnits6(2_500_000n, 6)).toBe(2_500_000n);
    expect(toUnits6(1n, 0)).toBe(1_000_000n);
    expect(usdTo6(1.5)).toBe(1_500_000n);
  });
});

describe("memory gas", () => {
  it("Ethereum is quadratic, Monad linear", () => {
    expect(ethMemoryGas(32)).toBe(3);
    expect(ethMemoryGas(32 * 512)).toBe(3 * 512 + 512);
    const eightMb = 8 * 1024 * 1024;
    expect(monadMemoryGas(eightMb)).toBe(131_072);
    // 8 MB on Ethereum: w = 262144 -> 786432 + 134217728
    expect(ethMemoryGas(eightMb)).toBe(786_432 + 134_217_728);
  });
});

describe("risk math", () => {
  it("health factor", () => {
    expect(healthFactor(1_000_000, 0, 9200, 900_000)).toBeCloseTo(1.0222, 4);
    expect(healthFactor(1, 0, 9200, 0)).toBe(Infinity);
  });

  it("depeg to liquidation lands exactly on HF = 1", () => {
    const s = depegToLiquidation(1_000_000, 0, 9200, 900_000);
    expect(s).toBeCloseTo(1 - 900_000 / 0.92 / 1_000_000, 10);
    expect(healthFactor(1_000_000 * (1 - s), 0, 9200, 900_000)).toBeCloseTo(1, 10);
    expect(depegToLiquidation(1_000_000, 0, 9200, 950_000)).toBeLessThan(0);
    // other collateral pushes the threshold out
    expect(depegToLiquidation(1_000_000, 200_000, 9200, 900_000)).toBeGreaterThan(s);
  });

  it("collateral / repay suggestions restore the target HF after the shock", () => {
    const [c, o, lt, d, shock] = [1_000_000, 0, 9200, 900_000, 0.05];
    const add = collateralToSurvive(c, o, lt, d, shock);
    expect(healthFactor((c + add) * (1 - shock), o, lt, d)).toBeCloseTo(1.05, 8);
    const rep = repayToSurvive(c, o, lt, d, shock);
    expect(healthFactor(c * (1 - shock), o, lt, d - rep)).toBeCloseTo(1.05, 8);
    expect(collateralToSurvive(10_000_000, 0, lt, d, shock)).toBe(0);
  });

  it("gas limit is above the measured engine gas and capped at 30M", () => {
    expect(simulateGasLimit(1_000_000n, 10)).toBe(1_150_000n + 40_000n + 250_000n);
    expect(simulateGasLimit(29_000_000n, 48)).toBe(30_000_000n);
    expect(monteCarloGasLimit(29_368_722n)).toBe(30_000_000n);
    expect(monteCarloGasLimit(1_000_000n)).toBe(1_400_000n);
  });

  it("MON cost = gas limit x 102 gwei (Monad charges the limit)", () => {
    expect(monCost(30_000_000n)).toBeCloseTo(3.06, 10);
    expect(monCost(80_000n)).toBeCloseTo(0.00816, 10);
  });
});

describe("calibrated book", () => {
  const real: RealPosition[] = [
    { user: "a", eMode: 1, collateralId: 9, collateralRaw: "0", collateralDecimals: 6, collateralUsd: 0, otherCollateralUsd: 0, debtUsd: 30_000_000, ltBps: 9200, bonusBps: 400, hfModel: 1.023 },
    { user: "b", eMode: 1, collateralId: 9, collateralRaw: "0", collateralDecimals: 6, collateralUsd: 0, otherCollateralUsd: 100_000, debtUsd: 1_000_000, ltBps: 9200, bonusBps: 400, hfModel: 1.2 },
  ];

  it("matches total debt, is deterministic, keeps HF near sources", () => {
    const a = calibrateBook(real, 2_000, 1.18, 7);
    const b = calibrateBook(real, 2_000, 1.18, 7);
    expect(a).toEqual(b);
    const total = a.reduce((s, p) => s + Number(p.debt), 0) / 1e6;
    expect(total).toBeCloseTo(31_000_000, -1);
    for (const p of a) {
      const hf = healthFactor((Number(p.collateral) / 1e6) * 1.18, p.otherColl, p.ltBps, Number(p.debt) / 1e6);
      expect(hf).toBeGreaterThan(1.0);
      expect(hf).toBeLessThan(1.21);
      expect(p.collateralId).toBe(9);
      packPosition(p); // fits the slot
    }
    // debt-weighted: the big low-HF source dominates
    const lowHf = a.filter((p) => p.otherColl === 0).length;
    expect(lowHf / a.length).toBeGreaterThan(0.9);
  });

  it("converts a real position", () => {
    const p = realToPacked({ ...real[0], collateralRaw: "2500000000000000000", collateralDecimals: 18 });
    expect(p.collateral).toBe(2_500_000n);
    expect(p.debt).toBe(30_000_000_000_000n);
  });
});

import { blockTimeline } from "./timeline";

describe("block timeline", () => {
  const W = 10n ** 18n;
  const stalled = {
    startPrice: (1185n * W) / 1000n,
    finalPrice: (11492n * W) / 10000n,
    log: [{ step: 1, round: 0, liquidations: 1, priceWad: (11832n * W) / 10000n, liquidatedDebt: 133_891n * W }],
  };

  it("shows every block even when the cascade stalls after block 1", () => {
    const t = blockTimeline(stalled, { steps: 20, shockBps: 300, oracleFeedbackBps: 0 });
    expect(t.points).toHaveLength(21);
    expect(t.activeBlocks).toBe(1);
    expect(t.lastActiveStep).toBe(1);
    expect(t.points[1].liquidated).toBeCloseTo(133_891, 0);
    expect(t.points.slice(2).every((p) => p.liquidations === 0)).toBe(true);
    // external oracle: straight-line path, final point = final price
    expect(t.points[10].price).toBeCloseTo(1.185 * (1 - 0.015), 6);
    expect(t.points[20].price).toBeCloseTo(1.1492, 6);
    for (let i = 1; i < t.points.length; i++) expect(t.points[i].price).toBeLessThanOrEqual(t.points[i - 1].price);
  });

  it("sums several waves inside a block", () => {
    const r = {
      startPrice: W,
      finalPrice: W / 2n,
      log: [
        { step: 1, round: 0, liquidations: 2, priceWad: (99n * W) / 100n, liquidatedDebt: 10n * W },
        { step: 1, round: 1, liquidations: 3, priceWad: (95n * W) / 100n, liquidatedDebt: 5n * W },
        { step: 3, round: 0, liquidations: 1, priceWad: (80n * W) / 100n, liquidatedDebt: 1n * W },
      ],
    };
    const t = blockTimeline(r, { steps: 4, shockBps: 1000, oracleFeedbackBps: 10_000 });
    expect(t.points[1]).toMatchObject({ liquidations: 5, waves: 2, liquidated: 15, price: 0.99 });
    expect(t.points[2].liquidations).toBe(0);
    expect(t.points[3].price).toBeCloseTo(0.8, 6);
    expect(t.points[4].price).toBeCloseTo(0.5, 6);
    expect(t.activeBlocks).toBe(2);
    expect(t.lastActiveStep).toBe(3);
  });
});
