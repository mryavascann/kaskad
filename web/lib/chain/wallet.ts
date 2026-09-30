// "Is my money safe?" logic, copied from app/(legacy)/cuzdan/Wallet.tsx. Pure risk math plus two
// reads: the Aave position (GET /api/position, Monad mainnet, server side) and a free cascade preview.

import type { Address } from "viem";
import type { ReserveLine, UserPosition } from "@/lib/kaskad/aave";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { collateralToSurvive, depegToLiquidation, repayToSurvive } from "@/lib/kaskad/math";
import type { ReadOptions } from "./engine";
import { BASE_SETTINGS } from "./scenario";
import type { Result, Scenario } from "./types";
import { isAddressLoose } from "./units";

export type { ReserveLine, UserPosition };

/** Curated Monad mainnet borrowers the page offers as examples (Wallet.tsx:15-18). */
export const SAMPLES: readonly { id: string; assetId: number; address: Address; description: string }[] = [
  {
    id: "largest-syrupusdc-borrower",
    assetId: 9,
    address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748",
    description: "Largest syrupUSDC borrower on Monad Aave",
  },
  {
    id: "largest-pt-ausd-borrower",
    assetId: 12,
    address: "0x278AA16c5C8E1D68938A302e809F126863D81dAA",
    description: "Largest PT-AUSD borrower on Monad Aave",
  },
];

/** Cascade shown for the user's dominant collateral: -3 % (Wallet.tsx:21, copy at :191). */
export const WALLET_CASCADE_SHOCK_BPS = 300;
/** Headline cascade the supply-side loss share uses: syrupUSDC -20 % (Wallet.tsx:44-46, copy at :267). */
export const HEADLINE_CASCADE = { assetId: 9, shockBps: 2_000 } as const;
/** HF the survive suggestions aim for: the default `target` of lib/kaskad/math.ts collateralToSurvive / repayToSurvive. */
export const SURVIVE_HF_TARGET = 1.05;
/** HF under which the page shows the health factor in red (Wallet.tsx:155). */
export const HF_DANGER = SURVIVE_HF_TARGET;
/** Protection slider: shock in %, default 5, range 1..30 (Wallet.tsx:39, :210). UI choice. */
export const SURVIVE_SHOCK_PCT = { min: 1, max: 30, default: 5 } as const;
/** Positions with at most this much debt (USD) are treated as "no debt" (Wallet.tsx:90). */
export const DUST_DEBT_USD = 1;
/** Supplied lines at or under this (USD) are ignored (Wallet.tsx:93). */
export const DUST_SUPPLY_USD = 1;
/** Utilization above which a reserve counts as lent out (Wallet.tsx:94, :255). */
export const LENT_UTILIZATION = 0.01;
/** Utilization above which withdrawals are at risk (Wallet.tsx:251-253). */
export const WITHDRAW_RISK_UTILIZATION = 0.9;

/**
 * The real-book scenario the wallet page runs for an asset (Wallet.tsx:21-32): steps 20, rounds 3,
 * feedback 0 = BASE_SETTINGS (Protocol.tsx:45-53), all positions. null for unknown assets.
 */
export function walletCascadeScenario(assetId: number, shockBps = WALLET_CASCADE_SHOCK_BPS): Scenario | null {
  const a = DEPLOYMENT.assets[assetId];
  if (!a) return null;
  return {
    assetId,
    shockBps,
    steps: BASE_SETTINGS.steps,
    maxRoundsPerStep: BASE_SETTINGS.rounds,
    maxPositions: a.realPositions,
    oracleFeedbackBps: BASE_SETTINGS.feedback,
  };
}

/** Wallet.tsx:21-32: free preview, null for unknown assets or any failure. */
export async function cascadeFor(assetId: number, shockBps = WALLET_CASCADE_SHOCK_BPS, opts: ReadOptions = {}): Promise<Result | null> {
  const s = walletCascadeScenario(assetId, shockBps);
  if (!s) return null;
  // The engine (viem encode/decode + read client) loads on the first cascade, not with the page.
  return import("./engine")
    .then(({ previewScenario }) => previewScenario(s, opts))
    .catch(() => null);
}

export type PositionErrorCode = "invalid-address" | "rate-limited" | "unconfigured" | "upstream" | "failed";
export type PositionLookup =
  | { ok: true; position: UserPosition }
  | { ok: false; error: { code: PositionErrorCode; status?: number; raw?: string } };

/**
 * GET /api/position?address= (Wallet.tsx:48-67). Invalid addresses are rejected before any request
 * (legacy: isAddress non-strict). Error codes follow app/api/position/route.ts statuses.
 */
export async function fetchPosition(address: string, fetchImpl: typeof fetch = fetch, url = "/api/position"): Promise<PositionLookup> {
  if (!isAddressLoose(address)) return { ok: false, error: { code: "invalid-address" } };
  try {
    const res = await fetchImpl(`${url}?address=${encodeURIComponent(address)}`);
    const body = (await res.json().catch(() => null)) as (UserPosition & { error?: string }) | null;
    if (res.ok && body) return { ok: true, position: body };
    const code: PositionErrorCode = res.ok
      ? "failed"
      : res.status === 400
        ? "invalid-address"
        : res.status === 429
          ? "rate-limited"
          : res.status === 503
            ? "unconfigured"
            : res.status === 502
              ? "upstream"
              : "failed";
    return { ok: false, error: { code, status: res.status, raw: body?.error } };
  } catch (e) {
    return { ok: false, error: { code: "failed", raw: String((e as Error)?.message ?? e) } };
  }
}

/** Liquidation threshold of the dominant collateral as a price drop (Wallet.tsx:171-181). */
export type ThresholdState =
  | { kind: "liquidatable-now" }
  | { kind: "never" }
  | { kind: "at-drop"; drop: number };

export type WithdrawState = "at-risk" | "withdrawable" | "collateral-only";

export type SupplyLine = ReserveLine & {
  withdraw: WithdrawState;
  /** Share of the reserve still withdrawable (1 - utilization), shown when at risk (Wallet.tsx:254). */
  liquidityShare: number;
};

export type WalletRisk = {
  borrower: boolean;
  dominant: ReserveLine | null;
  hf: number | null;
  hfDanger: boolean;
  /** Fractional drop of the dominant collateral at which HF = 1 (depegToLiquidation), borrowers only. */
  threshold: number | null;
  thresholdState: ThresholdState | null;
  /** Price drop of the -3 % real-book cascade for the dominant collateral (Wallet.tsx:92). */
  cascadeDrop: number | null;
  cascadeStuckDebtUsd: number | null;
  cascadeBadDebtUsd: number | null;
  /** The user's position is liquidated in that cascade (Wallet.tsx:194). */
  liquidatedInCascade: boolean | null;
  supplied: SupplyLine[];
  lentUsd: number;
  /** Approximate share of the headline cascade's bad debt on lent deposits (Wallet.tsx:96). */
  lossShareUsd: number;
  headlineBadDebtUsd: number | null;
};

const withdrawState = (u: number): WithdrawState =>
  u > WITHDRAW_RISK_UTILIZATION ? "at-risk" : u > LENT_UTILIZATION ? "withdrawable" : "collateral-only";

/** Derived risk (Wallet.tsx:88-96, 149-259), identical math. */
export function walletRisk(pos: UserPosition, cascade: Result | null, headline: Result | null): WalletRisk {
  const d = pos.dominant;
  const borrower = pos.debtUsd > DUST_DEBT_USD;
  const threshold = d && borrower ? depegToLiquidation(d.suppliedUsd, pos.otherLtAdjustedUsd, d.ltBps, pos.debtUsd) : null;
  const cascadeDrop = cascade ? 1 - wadToNum(cascade.finalPrice) / wadToNum(cascade.startPrice) : null;
  const supplied = pos.reserves
    .filter((r) => r.suppliedUsd > DUST_SUPPLY_USD)
    .map((r) => ({ ...r, withdraw: withdrawState(r.utilization), liquidityShare: 1 - r.utilization }));
  const lentUsd = supplied.filter((r) => r.utilization > LENT_UTILIZATION).reduce((s, r) => s + r.suppliedUsd, 0);
  const lossShareUsd = headline ? (lentUsd / Math.max(1, pos.protocol.suppliedUsd)) * wadToNum(headline.badDebt) : 0;
  const thresholdState: ThresholdState | null =
    threshold === null ? null : threshold <= 0 ? { kind: "liquidatable-now" } : threshold >= 1 ? { kind: "never" } : { kind: "at-drop", drop: threshold };
  return {
    borrower,
    dominant: d,
    hf: pos.hfOnchain,
    hfDanger: pos.hfOnchain !== null && pos.hfOnchain < HF_DANGER,
    threshold,
    thresholdState,
    cascadeDrop,
    cascadeStuckDebtUsd: cascade ? wadToNum(cascade.stuckDebt) : null,
    cascadeBadDebtUsd: cascade ? wadToNum(cascade.badDebt) : null,
    liquidatedInCascade: threshold !== null && cascadeDrop !== null ? threshold < cascadeDrop : null,
    supplied,
    lentUsd,
    lossShareUsd,
    headlineBadDebtUsd: headline ? wadToNum(headline.badDebt) : null,
  };
}

/**
 * Extra dominant collateral or debt repayment that keeps HF >= 1.05 after a `shockPct` % drop
 * (Wallet.tsx:214, :220). null without a dominant collateral.
 */
export function surviveSuggestions(pos: UserPosition, shockPct: number): { addCollateralUsd: number; repayUsd: number } | null {
  const d = pos.dominant;
  if (!d) return null;
  const shock = shockPct / 100;
  return {
    addCollateralUsd: collateralToSurvive(d.suppliedUsd, pos.otherLtAdjustedUsd, d.ltBps, pos.debtUsd, shock, SURVIVE_HF_TARGET),
    repayUsd: repayToSurvive(d.suppliedUsd, pos.otherLtAdjustedUsd, d.ltBps, pos.debtUsd, shock, SURVIVE_HF_TARGET),
  };
}
