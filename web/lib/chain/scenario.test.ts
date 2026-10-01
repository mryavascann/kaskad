import { describe, expect, it } from "vitest";
import { CALIBRATED, DEPLOYMENT, RESOLUTIONS, type AssetInfo } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { fixtureRun } from "./__fixtures__/load";
import {
  BASE_SETTINGS,
  CURVE_SHOCKS_BPS,
  DEFAULT_PRESET_ID,
  ETH_BOOKS,
  PRESETS,
  assetFacts,
  buildScenario,
  calibratedScale,
  compareParams,
  daysToMaturity,
  effectiveResolution,
  isCalibratedRun,
  matchPreset,
  monteCarloBase,
  pickerAssets,
  presetById,
  presetFacts,
  resolutionOptions,
  resultFacts,
  stressCurveScenarios,
  symbol,
  symbolParts,
  visiblePresets,
} from "./scenario";
import type { Settings } from "./types";

/** app/_components/Protocol.tsx:201-217, verbatim, as the oracle. */
function legacyScenario(st: Settings) {
  const asset = DEPLOYMENT.assets[st.assetId];
  const canCalibrate = asset.calibratedPositions > 0;
  const useCal = st.calibrated && canCalibrate;
  const maxRes = Math.min(st.resolution, asset.calibratedPositions || st.resolution);
  return {
    assetId: useCal ? CALIBRATED | st.assetId : st.assetId,
    shockBps: Math.round(st.shockPct * 100),
    steps: st.steps,
    maxRoundsPerStep: st.rounds,
    maxPositions: useCal ? maxRes : asset.realPositions,
    oracleFeedbackBps: st.feedback,
  };
}
const legacySym = (a: AssetInfo) => a.symbol.replace("-8OCT2026", ""); // Protocol.tsx:114

describe("settings -> scenario", () => {
  it("BASE_SETTINGS is the legacy base (Protocol.tsx:45-53)", () => {
    expect(BASE_SETTINGS).toEqual({ assetId: 9, shockPct: 3, steps: 20, rounds: 3, feedback: 0, calibrated: false, resolution: 10_000 });
  });

  it("presets keep the legacy ids, order and settings diffs (Protocol.tsx:55-112)", () => {
    const B = BASE_SETTINGS;
    expect(PRESETS.map((p) => [p.id, p.settings])).toEqual([
      ["ufak", { ...B, shockPct: 0.3 }],
      ["sali", { ...B }],
      ["worst", { ...B, feedback: 10_000 }],
      ["pt", { ...B, assetId: 12, shockPct: 1 }],
      ["maple-eth", { ...B, assetId: 15 }],
      ["eth", { ...B, assetId: 7, shockPct: 20 }],
      ["derin", { ...B, assetId: 13, shockPct: 10 }],
      ["stres", { ...B, calibrated: true, resolution: 10_000 }],
    ]);
    expect(DEFAULT_PRESET_ID).toBe("sali");
    expect(Object.isFrozen(presetById("sali").settings)).toBe(true);
  });

  it("buildScenario matches the legacy builder on every preset and a settings grid", () => {
    for (const p of PRESETS) expect(buildScenario(p.settings)).toEqual(legacyScenario(p.settings));
    for (const assetId of Object.keys(DEPLOYMENT.assets).map(Number))
      for (const calibrated of [false, true])
        for (const resolution of [500, 2_000, 10_000, 20_000])
          for (const shockPct of [0, 0.1, 0.15, 0.3, 2.31, 3, 49.9]) {
            const st = { ...BASE_SETTINGS, assetId, calibrated, resolution, shockPct, feedback: 10_000 };
            expect(buildScenario(st)).toEqual(legacyScenario(st));
          }
  });

  it("gives the finding scenario and the 10,000-position stress test", () => {
    expect(buildScenario(presetById("sali").settings)).toEqual({
      assetId: 9,
      shockBps: 300,
      steps: 20,
      maxRoundsPerStep: 3,
      maxPositions: 57,
      oracleFeedbackBps: 0,
    });
    const stres = buildScenario(presetById("stres").settings);
    expect(stres.assetId).toBe(256 | 9);
    expect(stres.maxPositions).toBe(10_000);
  });

  it("falls back to the real book when an asset has no calibrated book", () => {
    const st = { ...BASE_SETTINGS, assetId: 5, calibrated: true };
    expect(isCalibratedRun(st)).toBe(false);
    expect(buildScenario(st)).toMatchObject({ assetId: 5, maxPositions: DEPLOYMENT.assets[5].realPositions });
    expect(effectiveResolution({ ...BASE_SETTINGS, calibrated: true, resolution: 20_000 })).toBe(10_000);
  });

  it("rejects unknown assets", () => {
    expect(() => buildScenario({ ...BASE_SETTINGS, assetId: 3 })).toThrow(RangeError);
  });

  it("derives the other panels' inputs like Protocol.tsx:221-234, 363-364", () => {
    const st = presetById("stres").settings;
    expect(monteCarloBase(st)).toEqual({ assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 0 });
    const c = stressCurveScenarios(9, 20, 3);
    expect(c.pool).toEqual({ assetId: 9, shockBps: 0, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 10_000 });
    expect(c.external.oracleFeedbackBps).toBe(0);
    expect(CURVE_SHOCKS_BPS).toEqual([10, 50, 100, 300, 500, 1000, 2000, 3000]);
    expect(compareParams(presetById("worst").settings)).toEqual({ shockBps: 300, feedback: 10_000, steps: 20, rounds: 3 });
    expect(resolutionOptions(9)).toEqual(RESOLUTIONS.filter((x) => x <= 10_000));
    expect(resolutionOptions(5)).toEqual([]);
  });

  it("matchPreset finds the preset whose settings are unchanged", () => {
    expect(matchPreset({ ...BASE_SETTINGS })).toBe("sali");
    expect(matchPreset({ ...BASE_SETTINGS, shockPct: 4 })).toBeNull();
    expect(matchPreset({ ...presetById("pt").settings })).toBe("pt");
  });
});

describe("calibrated scaling and result facts", () => {
  const sali = fixtureRun("sali");

  it("scale is 1 on a real book", () => {
    expect(calibratedScale(presetById("sali").settings, sali.result)).toBe(1);
    expect(calibratedScale(presetById("stres").settings, null)).toBe(1);
  });

  it("scale is asset debt / simulated debt on a calibrated run (Protocol.tsx:244)", () => {
    const half = { ...sali.result, totalDebt: sali.result.totalDebt / 2n };
    const st = presetById("stres").settings;
    const expected = DEPLOYMENT.assets[9].debtUsd / Math.max(1, wadToNum(half.totalDebt));
    expect(calibratedScale(st, half)).toBeCloseTo(expected, 12);
    expect(calibratedScale(st, half)).toBeCloseTo(2, 6);
    const f = resultFacts(half, st);
    expect(f.scaled).toBe(true);
    expect(f.stuckDebtUsd).toBeCloseTo(wadToNum(half.stuckDebt) * expected, 3);
    expect(f.stuckDebtShare).toBeCloseTo(wadToNum(half.stuckDebt) / wadToNum(half.totalDebt), 12);
  });

  it("resultFacts of the finding run", () => {
    const f = resultFacts(sali.result, presetById("sali").settings);
    expect(f).toMatchObject({ scale: 1, scaled: false, badDebtUsd: 0, liquidations: 1, rounds: 1, positionsUsed: 57, hasLiquidations: true, priceHalved: false });
    expect(f.priceDrop).toBeCloseTo(0.03, 6);
    expect(resultFacts(fixtureRun("worst").result, presetById("worst").settings).priceHalved).toBe(true);
  });
});

describe("symbols, chains, maturity", () => {
  it("symbol() equals the legacy sym() for every asset", () => {
    for (const a of Object.values(DEPLOYMENT.assets)) expect(symbol(a)).toBe(legacySym(a));
  });

  it("splits chain and maturity suffixes", () => {
    expect(symbolParts(DEPLOYMENT.assets[12])).toEqual({ base: "PT-AUSD", chain: "monad", maturity: "2026-10-08" });
    expect(symbolParts(DEPLOYMENT.assets[15])).toEqual({ base: "syrupUSDT", chain: "ethereum", maturity: null });
    expect(symbolParts({ symbol: "PT-X-31DEC2027 (Ethereum)" })).toEqual({ base: "PT-X", chain: "ethereum", maturity: "2027-12-31" });
  });

  it("ETH_BOOKS is derived from the data and equals the legacy literal (Protocol.tsx:29)", () => {
    expect(ETH_BOOKS).toEqual([7, 13, 14, 15]);
  });

  it("days to maturity replace the stale '12 gün' copy", () => {
    expect(daysToMaturity("2026-10-08", new Date("2026-09-26T12:00:00Z"))).toBe(12); // Monad Blitz day
    expect(daysToMaturity("2026-10-08", new Date("2026-09-30T23:59:00Z"))).toBe(8);
    expect(daysToMaturity("2026-10-08", new Date("2026-10-09T00:00:00Z"))).toBe(-1);
  });
});

describe("preset facts (numbers the stories hard-coded)", () => {
  it("come from deployment.json and the preset settings", () => {
    const maple = presetFacts("maple-eth");
    expect(maple).toMatchObject({ assetId: 15, symbol: "syrupUSDT", chain: "ethereum", book: "real" });
    expect(maple.debtUsd).toBe(DEPLOYMENT.assets[15].debtUsd);
    expect(maple.debtUsd / 1e6).toBeCloseTo(98.8, 1); // legacy "$98,8M"
    const eth = presetFacts("eth");
    expect(eth).toMatchObject({ symbol: "WETH", chain: "ethereum", shockPct: 20 });
    expect(Math.round(eth.debtUsd / 1e6)).toBe(513); // legacy "$513M"
    expect(presetFacts("worst")).toMatchObject({ oracle: "pool", shockPct: 3, symbol: "syrupUSDC" });
    expect(presetFacts("ufak").shockPct).toBe(0.3);
    expect(presetFacts("stres")).toMatchObject({ book: "calibrated", positions: 10_000 });
    expect(presetFacts("sali")).toMatchObject({ positions: 57, depthUsd: 7_036_204, depthIsAssumption: false });
    expect(presetFacts("pt", new Date("2026-09-26T08:00:00Z")).maturity).toEqual({ date: "2026-10-08", daysLeft: 12 });
    expect(presetFacts("derin").depthToDebt).toBeCloseTo(DEPLOYMENT.assets[13].depthUsd / DEPLOYMENT.assets[13].debtUsd, 12);
  });

  it("hides presets whose asset is missing (Protocol.tsx:195)", () => {
    expect(visiblePresets().map((p) => p.id)).toEqual(PRESETS.map((p) => p.id));
  });
});

describe("asset facts (honesty metadata)", () => {
  it("exposes depth measured vs assumed with its note, and the recovery assumption", () => {
    const syrup = assetFacts(9)!;
    expect(syrup.depth).toEqual({
      usd: 7_036_204,
      isAssumption: false,
      source: DEPLOYMENT.assets[9].depthSource,
      note: DEPLOYMENT.assets[9].depthNote,
    });
    expect(syrup.recovery?.bps).toBe(0);
    expect(syrup).toMatchObject({ canCalibrate: true, featured: true, chain: "monad" });
    const usde = assetFacts(2)!;
    expect(usde.depth.isAssumption).toBe(true);
    expect(usde.recovery?.bps).toBe(1_000);
    expect(assetFacts(0)!.recovery).toBeNull();
    expect(assetFacts(99)).toBeNull();
  });

  it("groups the picker like Protocol.tsx:318-323", () => {
    const { featured, others } = pickerAssets();
    expect(featured.map((a) => a.id)).toEqual([9, 5]);
    expect(others.map((a) => a.id)).toEqual([12, 2, 8, 15, 14, 13, 7]);
  });
});
