// Scenario settings, presets and asset facts (no network). Logic copied from
// app/_components/Protocol.tsx; story copy became typed facts so pages can render EN / TR.

import { CALIBRATED, DEPLOYMENT, RESOLUTIONS, UI_ASSETS, type AssetInfo } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import type { BookChain, BookKind, OracleMode, Result, Scenario, Settings } from "./types";

// ------------------------------------------------------------------ settings

/** Oracle feedback values the UI offers (Protocol.tsx:329): external price vs instant pool price. */
export const ORACLE_FEEDBACK_BPS = { external: 0, pool: 10_000 } as const;

/** Protocol.tsx:45-53. Realistic default: the oracle follows the external price (Chainlink / rate). */
export const BASE_SETTINGS: Readonly<Settings> = Object.freeze({
  assetId: 9,
  shockPct: 3,
  steps: 20,
  rounds: 3,
  feedback: ORACLE_FEEDBACK_BPS.external,
  calibrated: false,
  resolution: 10_000,
});

/** Assets with their own picker button (Protocol.tsx:320-322); the rest go to the "other" select. */
export const FEATURED_ASSET_IDS: readonly number[] = [9, 5];
/** Shock slider and quick chips in % (Protocol.tsx:326-327). UI choice. */
export const SHOCK_SLIDER_PCT = { min: 0, max: 50, step: 0.1 } as const;
export const SHOCK_CHIPS_PCT: readonly number[] = [0.1, 0.5, 1, 3, 5, 10, 20, 30];
/** Steps / rounds sliders (Protocol.tsx:332-333) = the engine bounds MAX_STEPS / MAX_ROUNDS (Kaskad.sol:21-22). */
export const STEPS_RANGE = { min: 1, max: 100 } as const;
export const ROUNDS_RANGE = { min: 1, max: 20 } as const;
/** Stress curve shock levels in bps (Protocol.tsx:27). */
export const CURVE_SHOCKS_BPS: readonly number[] = [10, 50, 100, 300, 500, 1000, 2000, 3000];

export const oracleMode = (feedbackBps: number): OracleMode => (feedbackBps > 0 ? "pool" : "external");

function asset(id: number): AssetInfo {
  const a = DEPLOYMENT.assets[id];
  if (!a) throw new RangeError(`unknown asset id ${id}`);
  return a;
}

/** Protocol.tsx:202-203: calibrated only if asked for and the asset has a calibrated book. */
export function isCalibratedRun(st: Settings): boolean {
  const a = DEPLOYMENT.assets[st.assetId];
  return st.calibrated && !!a && a.calibratedPositions > 0;
}

/** Protocol.tsx:205: resolution clamped to the calibrated book size. */
export function effectiveResolution(st: Settings): number {
  const a = asset(st.assetId);
  return Math.min(st.resolution, a.calibratedPositions || st.resolution);
}

/** Protocol.tsx:204: resolution steps available for an asset's calibrated book. */
export function resolutionOptions(assetId: number): number[] {
  const cal = DEPLOYMENT.assets[assetId]?.calibratedPositions ?? 0;
  return RESOLUTIONS.filter((x) => x <= cal);
}

/** Settings -> engine Scenario (Protocol.tsx:201-217). Throws RangeError for an unknown asset. */
export function buildScenario(st: Settings): Scenario {
  const a = asset(st.assetId);
  const useCal = isCalibratedRun(st);
  return {
    assetId: useCal ? CALIBRATED | st.assetId : st.assetId,
    shockBps: Math.round(st.shockPct * 100),
    steps: st.steps,
    maxRoundsPerStep: st.rounds,
    maxPositions: useCal ? effectiveResolution(st) : a.realPositions,
    oracleFeedbackBps: st.feedback,
  };
}

/** Monte Carlo base: always the real book (Protocol.tsx:363). */
export function monteCarloBase(st: Settings): Scenario {
  return {
    assetId: st.assetId,
    shockBps: Math.round(st.shockPct * 100),
    steps: st.steps,
    maxRoundsPerStep: st.rounds,
    maxPositions: asset(st.assetId).realPositions,
    oracleFeedbackBps: st.feedback,
  };
}

/** Stress curve inputs: real book, shock 0 (overridden per point), both oracle modes (Protocol.tsx:221-234). */
export function stressCurveScenarios(assetId: number, steps: number, rounds: number): Record<OracleMode, Scenario> {
  const base = { assetId, shockBps: 0, steps, maxRoundsPerStep: rounds, maxPositions: asset(assetId).realPositions };
  return {
    pool: { ...base, oracleFeedbackBps: ORACLE_FEEDBACK_BPS.pool },
    external: { ...base, oracleFeedbackBps: ORACLE_FEEDBACK_BPS.external },
  };
}

/** Inputs of the Monad <-> Ethereum table (Protocol.tsx:364). */
export function compareParams(st: Settings) {
  return { shockBps: Math.round(st.shockPct * 100), feedback: st.feedback, steps: st.steps, rounds: st.rounds };
}

/**
 * USD amounts of a partial calibrated run are scaled to the full book's debt (Protocol.tsx:243-244):
 * asset debt / simulated debt on a calibrated run, 1 otherwise.
 */
export function calibratedScale(st: Settings, r: Result | null): number {
  return r && isCalibratedRun(st) ? asset(st.assetId).debtUsd / Math.max(1, wadToNum(r.totalDebt)) : 1;
}

/** Result counters and stats as numbers (Protocol.tsx:343-356), scaled like the legacy screen. */
export function resultFacts(r: Result, st: Settings) {
  const scale = calibratedScale(st, r);
  const total = wadToNum(r.totalDebt);
  const start = wadToNum(r.startPrice);
  const final = wadToNum(r.finalPrice);
  return {
    scale,
    /** true on a calibrated run: amounts are scaled to the full book (legacy " · ölçeklendi"). */
    scaled: isCalibratedRun(st),
    badDebtUsd: wadToNum(r.badDebt) * scale,
    stuckDebtUsd: wadToNum(r.stuckDebt) * scale,
    liquidatedUsd: wadToNum(r.totalLiquidated) * scale,
    totalDebtUsd: total * scale,
    /** Shares of the simulated debt (scale-free, Protocol.tsx:346-347). */
    badDebtShare: wadToNum(r.badDebt) / Math.max(1, total),
    stuckDebtShare: wadToNum(r.stuckDebt) / Math.max(1, total),
    liquidations: r.liquidations,
    rounds: r.rounds,
    positionsUsed: r.positionsUsed,
    startPrice: start,
    finalPrice: final,
    priceDrop: start > 0 ? 1 - final / start : 0,
    /** Final price below half the start (legacy red tone, Protocol.tsx:352). */
    priceHalved: r.finalPrice < r.startPrice / 2n,
    /** Any wave liquidated something (Protocol.tsx:353). */
    hasLiquidations: r.log.length > 0,
  };
}

// ------------------------------------------------------------------ symbols, chains, maturity

/** Suffix deployment.json puts on books read from Aave on Ethereum. */
const ETHEREUM_SUFFIX = " (Ethereum)";
/** Pendle-style maturity suffix, e.g. "-8OCT2026". */
const MATURITY_SUFFIX = /-(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4})$/;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export type SymbolParts = {
  /** Token symbol without chain or maturity suffix, e.g. "PT-AUSD", "syrupUSDT". */
  base: string;
  chain: BookChain;
  /** ISO date (UTC) parsed from the maturity suffix, e.g. "2026-10-08". */
  maturity: string | null;
};

export function symbolParts(a: Pick<AssetInfo, "symbol">): SymbolParts {
  let s = a.symbol;
  const chain: BookChain = s.endsWith(ETHEREUM_SUFFIX) ? "ethereum" : "monad";
  if (chain === "ethereum") s = s.slice(0, -ETHEREUM_SUFFIX.length);
  const m = MATURITY_SUFFIX.exec(s);
  if (!m) return { base: s, chain, maturity: null };
  const month = String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0");
  return { base: s.slice(0, m.index), chain, maturity: `${m[3]}-${month}-${m[1].padStart(2, "0")}` };
}

/** Legacy display symbol (Protocol.tsx:114 `sym`): maturity suffix stripped, chain suffix kept. */
export function symbol(a: Pick<AssetInfo, "symbol">): string {
  const p = symbolParts(a);
  return p.chain === "ethereum" ? `${p.base}${ETHEREUM_SUFFIX}` : p.base;
}

/** Books read from Aave on Ethereum and simulated on Monad (Protocol.tsx:29 had them as a literal). */
export const isEthereumBook = (a: Pick<AssetInfo, "symbol">): boolean => symbolParts(a).chain === "ethereum";
export const ETH_BOOKS: readonly number[] = Object.values(DEPLOYMENT.assets)
  .filter(isEthereumBook)
  .map((a) => a.id)
  .sort((x, y) => x - y);

/** Whole UTC days from `now` to an ISO maturity date (negative once matured). */
export function daysToMaturity(isoDate: string, now: Date = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

// ------------------------------------------------------------------ asset facts (honesty metadata)

export type AssetFacts = {
  id: number;
  symbol: string;
  baseSymbol: string;
  chain: BookChain;
  maturity: string | null;
  priceUsd: number;
  suppliedUsd: number;
  collateralUsd: number;
  debtUsd: number;
  ltBps: number;
  bonusBps: number;
  realPositions: number;
  calibratedPositions: number;
  canCalibrate: boolean;
  featured: boolean;
  /** Exit-liquidity depth the virtual pool uses; `isAssumption` + `note` must be shown (Protocol.tsx:337). */
  depth: { usd: number; isAssumption: boolean; source: string; note: string };
  /** Pool depth / debt at risk (ComparePanel.tsx:79). */
  depthToDebt: number;
  /** Assumed per-block arbitrage recovery on the real book (lib/kaskad/recovery.ts); null = none set. */
  recovery: { bps: number; why: string } | null;
};

export function assetFacts(id: number): AssetFacts | null {
  const a = DEPLOYMENT.assets[id];
  if (!a) return null;
  const p = symbolParts(a);
  const rec = RECOVERY_BPS[id];
  return {
    id,
    symbol: symbol(a),
    baseSymbol: p.base,
    chain: p.chain,
    maturity: p.maturity,
    priceUsd: a.priceUsd,
    suppliedUsd: a.suppliedUsd,
    collateralUsd: a.collateralUsd,
    debtUsd: a.debtUsd,
    ltBps: a.ltBps,
    bonusBps: a.bonusBps,
    realPositions: a.realPositions,
    calibratedPositions: a.calibratedPositions,
    canCalibrate: a.calibratedPositions > 0,
    featured: FEATURED_ASSET_IDS.includes(id),
    depth: { usd: a.depthUsd, isAssumption: a.depthIsAssumption, source: a.depthSource, note: a.depthNote },
    depthToDebt: a.depthUsd / Math.max(1, a.debtUsd),
    recovery: rec ? { bps: rec.bps, why: rec.why } : null,
  };
}

/** Asset picker groups (Protocol.tsx:318-323): featured buttons, then the other UI assets. */
export function pickerAssets(): { featured: AssetInfo[]; others: AssetInfo[] } {
  return {
    featured: FEATURED_ASSET_IDS.map((id) => DEPLOYMENT.assets[id]).filter(Boolean),
    others: UI_ASSETS.filter((a) => !FEATURED_ASSET_IDS.includes(a.id)),
  };
}

// ------------------------------------------------------------------ presets

export type PresetId = "ufak" | "sali" | "worst" | "pt" | "maple-eth" | "eth" | "derin" | "stres";
export type Preset = { id: PresetId; settings: Readonly<Settings> };

const preset = (id: PresetId, diff: Partial<Settings>): Preset => ({
  id,
  settings: Object.freeze({ ...BASE_SETTINGS, ...diff }),
});

/** Protocol.tsx:55-112 as data: id + settings diff from BASE_SETTINGS. Order = legacy order. */
export const PRESETS: readonly Preset[] = [
  preset("ufak", { shockPct: 0.3 }),
  preset("sali", {}),
  preset("worst", { feedback: ORACLE_FEEDBACK_BPS.pool }),
  preset("pt", { assetId: 12, shockPct: 1 }),
  preset("maple-eth", { assetId: 15 }),
  preset("eth", { assetId: 7, shockPct: 20 }),
  preset("derin", { assetId: 13, shockPct: 10 }),
  preset("stres", { calibrated: true, resolution: 10_000 }),
];

/** Selected on first load (Protocol.tsx:183-184). */
export const DEFAULT_PRESET_ID: PresetId = "sali";

export function presetById(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new RangeError(`unknown preset ${id}`);
  return p;
}

/** Presets whose asset exists in this deployment (Protocol.tsx:195). */
export function visiblePresets(): Preset[] {
  return PRESETS.filter((p) => DEPLOYMENT.assets[p.settings.assetId]);
}

/** Which preset (if any) exactly matches the settings; any manual change clears it (Protocol.tsx:196-199). */
export function matchPreset(st: Settings): PresetId | null {
  const keys = Object.keys(BASE_SETTINGS) as (keyof Settings)[];
  return visiblePresets().find((p) => keys.every((k) => p.settings[k] === st[k]))?.id ?? null;
}

export type PresetFacts = {
  id: PresetId;
  assetId: number;
  /** Display symbol without chain / maturity suffix. */
  symbol: string;
  chain: BookChain;
  shockPct: number;
  oracle: OracleMode;
  book: BookKind;
  /** Positions the run simulates: real book size, or the calibrated resolution. */
  positions: number;
  debtUsd: number;
  collateralUsd: number;
  depthUsd: number;
  depthIsAssumption: boolean;
  depthToDebt: number;
  /** PT maturity parsed from the symbol, with whole days left at `now` (legacy hard-coded "12 gün"). */
  maturity: { date: string; daysLeft: number } | null;
};

/**
 * The numbers each preset's story used to hard-code (Protocol.tsx:55-112, 281-282), from the
 * preset's settings and deployment.json. Pages turn them into copy.
 */
export function presetFacts(id: PresetId, now: Date = new Date()): PresetFacts {
  const p = presetById(id);
  const a = asset(p.settings.assetId);
  const parts = symbolParts(a);
  const calibrated = isCalibratedRun(p.settings);
  return {
    id,
    assetId: a.id,
    symbol: parts.base,
    chain: parts.chain,
    shockPct: p.settings.shockPct,
    oracle: oracleMode(p.settings.feedback),
    book: calibrated ? "calibrated" : "real",
    positions: calibrated ? effectiveResolution(p.settings) : a.realPositions,
    debtUsd: a.debtUsd,
    collateralUsd: a.collateralUsd,
    depthUsd: a.depthUsd,
    depthIsAssumption: a.depthIsAssumption,
    depthToDebt: a.depthUsd / Math.max(1, a.debtUsd),
    maturity: parts.maturity ? { date: parts.maturity, daysLeft: daysToMaturity(parts.maturity, now) } : null,
  };
}
