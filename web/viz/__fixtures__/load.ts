// Typed access to viz-runs.json: a stress curve, two Monte Carlo runs and a calibrated-book preview,
// recorded read-only from Monad testnet (eth_call, pinned to one block). The engine-run fixtures in
// lib/chain/__fixtures__ have books and single previews; these add what they do not have.
import type { CurveResult, MonteCarloResult, Result, Scenario } from "@/lib/chain/types";
import raw from "./viz-runs.json";

const big = (hex: string) => BigInt(hex);

type RawCurve = (typeof raw.curve)["pool"];
const toCurve = (c: RawCurve): CurveResult => ({
  bad: c.bad.map(big),
  liq: c.liq.map(big),
  gasUsed: big(c.gasUsed),
  memoryBytes: big(c.memoryBytes),
});

type RawMc = NonNullable<(typeof raw.monteCarlo)[number]["result"]>;
const toMc = (r: RawMc): MonteCarloResult => ({
  paths: big(r.paths),
  positionsUsed: big(r.positionsUsed),
  totalDebt: big(r.totalDebt),
  meanBadDebt: big(r.meanBadDebt),
  p95BadDebt: big(r.p95BadDebt),
  worstBadDebt: big(r.worstBadDebt),
  lossPaths: big(r.lossPaths),
  meanShockBps: big(r.meanShockBps),
  worstShockBps: big(r.worstShockBps),
  gasUsed: big(r.gasUsed),
  memoryBytes: big(r.memoryBytes),
  badDebt: r.badDebt.map(big),
  shockBps: r.shockBps.map(big),
});

type RawResult = NonNullable<(typeof raw.calibrated)["result"]>;
const toResult = (r: RawResult): Result => ({
  totalDebt: big(r.totalDebt),
  totalCollateral: big(r.totalCollateral),
  totalLiquidated: big(r.totalLiquidated),
  totalSeized: big(r.totalSeized),
  badDebt: big(r.badDebt),
  stuckDebt: big(r.stuckDebt),
  startPrice: big(r.startPrice),
  finalPrice: big(r.finalPrice),
  rounds: r.rounds,
  liquidations: r.liquidations,
  positionsUsed: r.positionsUsed,
  gasUsed: big(r.gasUsed),
  memoryBytes: big(r.memoryBytes),
  log: r.log.map((l) => ({
    step: l.step,
    round: l.round,
    liquidations: l.liquidations,
    priceWad: big(l.priceWad),
    liquidatedDebt: big(l.liquidatedDebt),
    seized: big(l.seized),
    deficit: big(l.deficit),
  })),
});

/** Monad testnet block every recorded call was pinned to. */
export const VIZ_BLOCK = Number(big(raw.block));
export const VIZ_RECORDED_AT = raw.recordedAt;

/** previewCurve on the real syrupUSDC book (asset 9, 20 blocks, 3 waves per block), both oracle modes. */
export const VIZ_CURVE = {
  assetId: raw.curve.assetId,
  shocksBps: raw.curve.shocksBps as readonly number[],
  pool: toCurve(raw.curve.pool),
  external: toCurve(raw.curve.external),
};

export type VizMonteCarloRun = { name: "sali" | "worst"; scenario: Scenario; paths: number; result: MonteCarloResult };

/** previewMC runs: "sali" (external price, 100 paths) and "worst" (pool price, 30 paths). */
export const VIZ_MONTE_CARLO: VizMonteCarloRun[] = raw.monteCarlo.flatMap((m) =>
  m.result ? [{ name: m.name as VizMonteCarloRun["name"], scenario: m.scenario, paths: m.paths, result: toMc(m.result) }] : [],
);

export const vizMonteCarlo = (name: VizMonteCarloRun["name"]): VizMonteCarloRun => {
  const run = VIZ_MONTE_CARLO.find((m) => m.name === name);
  if (!run) throw new Error(`no Monte Carlo fixture ${name}`);
  return run;
};

/** preview of preset "stres": the 10,000-position calibrated syrupUSDC book, −3 %. */
export const VIZ_CALIBRATED: { scenario: Scenario; result: Result } = (() => {
  if (!raw.calibrated.result) throw new Error("calibrated fixture has no result");
  return { scenario: raw.calibrated.scenario, result: toResult(raw.calibrated.result) };
})();
