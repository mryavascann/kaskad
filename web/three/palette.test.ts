import { describe, expect, it } from "vitest";
import { hex } from "@/design/tokens";
import { buildHeroModel, PRE_WARMTH, TIMING, type HeroDomino } from "./model";
import { BAD_DEBT_FACE, dominoLook, EDGE, heatOf, hexToLinear, linearToHex, SCENE_COLORS, type Rgb } from "./palette";

const same = (a: Rgb, b: Rgb) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

const model = buildHeroModel([
  { order: 0, debtUsd: 1e6, outcome: "stuck", tipAt: 0.2, thresholdAt: 0.18 },
  { order: 1, debtUsd: 1e6, outcome: "stuck", tipAt: 0.3, hitAt: 0.3, thresholdAt: 0.28 },
  { order: 2, debtUsd: 1e6, outcome: "liquidated", tipAt: 0.4, hitAt: 0.4, thresholdAt: 0.38 },
  { order: 3, debtUsd: 1e6, outcome: "bad-debt", tipAt: 0.5, thresholdAt: 0.48 },
  { order: 4, debtUsd: 1e6, outcome: "safe", thresholdAt: 0.18 },
  { order: 5, debtUsd: 1e6, outcome: "safe", thresholdAt: null },
]);
const [stuck, partial, liquidated, badDebt, nearSafe, farSafe] = model.dominoes;
const settled = (d: HeroDomino) => (d.landAt ?? 0) + 0.45;

describe("colors", () => {
  it("come from the design tokens (sRGB hex → linear)", () => {
    expect(SCENE_COLORS.warn).toEqual(hexToLinear(hex.warn));
    expect(SCENE_COLORS.liq).toEqual(hexToLinear(hex.liq));
    expect(SCENE_COLORS.hairline).toEqual(hexToLinear(hex["fg-3"]));
    expect(SCENE_COLORS.void).toEqual(hexToLinear(hex.void));
  });

  it("round-trip between hex and linear RGB", () => {
    for (const token of ["void", "warn", "liq", "monad", "fg-3", "safe"] as const) expect(linearToHex(hexToLinear(hex[token]))).toBe(hex[token]);
    expect(hexToLinear("#000000")).toEqual([0, 0, 0]);
    expect(hexToLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(linearToHex([2, -1, 0.5])).toBe("#ff00bc");
  });
});

describe("dominoLook", () => {
  it("draws upright dominoes with a faint cool hairline", () => {
    const look = dominoLook(farSafe, 1);
    expect(same(look.top, SCENE_COLORS.hairline)).toBe(true);
    expect(look.intensity).toBe(EDGE.upright);
    expect(look.face).toBe(0);
    expect(dominoLook(model.dominoes[0], 0).intensity).toBe(EDGE.upright);
  });

  it("pre-glows an upright edge faintly as the price nears its threshold, full amber once under it", () => {
    expect(dominoLook(nearSafe, 0.18 - TIMING.warmWindow - 0.01).intensity).toBe(EDGE.upright);
    const close = dominoLook(nearSafe, 0.18 - 0.001);
    expect(close.intensity).toBeGreaterThan(EDGE.upright);
    expect(close.intensity).toBeLessThan(EDGE.upright + (EDGE.warm - EDGE.upright) * (PRE_WARMTH + 0.01));
    const warm = dominoLook(nearSafe, 0.18);
    expect(same(warm.top, SCENE_COLORS.warn)).toBe(true);
    expect(warm.intensity).toBe(EDGE.warm);
  });

  it("never shows an outcome before the domino tips", () => {
    // Same threshold, different outcomes: identical until the stuck one tips.
    expect(dominoLook(stuck, 0.19)).toEqual(dominoLook(nearSafe, 0.19));
  });

  it("colors a stuck domino amber once it has fallen", () => {
    const look = dominoLook(stuck, settled(stuck));
    expect(same(look.top, SCENE_COLORS.warn)).toBe(true);
    expect(same(look.low, SCENE_COLORS.warn)).toBe(true);
    expect(look.intensity).toBeCloseTo(EDGE.stuck, 3);
  });

  it("keeps a red foot under the amber on a partly liquidated stuck domino", () => {
    const look = dominoLook(partial, settled(partial) + 0.3);
    expect(same(look.top, SCENE_COLORS.warn)).toBe(true);
    expect(same(look.low, SCENE_COLORS.liq)).toBe(true);
  });

  it("flashes red when a liquidation hits, then settles", () => {
    const hit = dominoLook(partial, partial.hitAt ?? 0);
    expect(hit.intensity).toBeCloseTo(EDGE.hit, 6);
    expect(same(hit.top, SCENE_COLORS.liq)).toBe(true);
    expect(dominoLook(partial, (partial.hitAt ?? 0) + 0.5).intensity).toBeLessThan(EDGE.stuck + 0.01);
  });

  it("colors liquidations and bad debt red, bad debt hotter and with tinted faces", () => {
    const liq = dominoLook(liquidated, settled(liquidated) + 0.3);
    const bad = dominoLook(badDebt, settled(badDebt));
    expect(same(liq.top, SCENE_COLORS.liq)).toBe(true);
    expect(same(bad.top, SCENE_COLORS.liq)).toBe(true);
    expect(liq.face).toBe(0);
    expect(bad.face).toBeCloseTo(BAD_DEBT_FACE, 9);
    expect(bad.intensity).toBeGreaterThan(liq.intensity);
  });

  it("orders intensities by alarm", () => {
    expect(EDGE.upright).toBeLessThan(EDGE.warm);
    expect(EDGE.warm).toBeLessThan(EDGE.stuck);
    expect(EDGE.stuck).toBeLessThan(EDGE.liquidated);
    expect(EDGE.liquidated).toBeLessThan(EDGE.badDebt);
    expect(EDGE.badDebt).toBeLessThan(EDGE.hit);
  });

  it("glows a moment brighter as a domino lands", () => {
    const land = stuck.landAt ?? 0;
    expect(dominoLook(stuck, land + 0.01).intensity).toBeGreaterThan(dominoLook(stuck, settled(stuck)).intensity);
  });
});

describe("heatOf", () => {
  it("is 0 for a cold upright domino and grows with alarm", () => {
    expect(heatOf(dominoLook(farSafe, 1))).toBe(0);
    const stuckHeat = heatOf(dominoLook(stuck, settled(stuck)));
    const badHeat = heatOf(dominoLook(badDebt, settled(badDebt)));
    expect(stuckHeat).toBeGreaterThan(0);
    expect(badHeat).toBeGreaterThan(stuckHeat);
  });
});
