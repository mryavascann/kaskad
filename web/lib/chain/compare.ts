// Monad <-> Ethereum table: same shock on books from both chains, all simulated on Monad.
// Rows copied from app/_components/ComparePanel.tsx:10-18 with role codes instead of Turkish notes.

import { DEPLOYMENT, type AssetInfo } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { isEthereumBook, symbolParts } from "./scenario";
import type { BookChain, Result, Scenario } from "./types";

/** Why a row is in the table (legacy notes, ComparePanel.tsx:12-17). null = the Monad reference row. */
export type CompareRole =
  | "same-maple-loop"
  | "same-asset-deep-pool"
  | "deep-liquidity-reference"
  | "eth-collateral-stable-debt"
  | "same-classic-position";

/** Table order and roles (ComparePanel.tsx:10-18). The chain is derived from the asset's book. */
export const COMPARE_ROWS: readonly { assetId: number; role: CompareRole | null }[] = [
  { assetId: 9, role: null },
  { assetId: 15, role: "same-maple-loop" },
  { assetId: 2, role: null },
  { assetId: 14, role: "same-asset-deep-pool" },
  { assetId: 13, role: "deep-liquidity-reference" },
  { assetId: 5, role: "eth-collateral-stable-debt" },
  { assetId: 7, role: "same-classic-position" },
];

/** Debounce of the table reload (ComparePanel.tsx:45). */
export const COMPARE_DEBOUNCE_MS = 900;
/** Depth / debt under which the ratio is flagged thin (ComparePanel.tsx:94). */
export const THIN_DEPTH_TO_DEBT = 0.1;

export type CompareParams = { shockBps: number; feedback: number; steps: number; rounds: number };

/** Rows whose asset exists in this deployment (ComparePanel.tsx:26). */
export function compareRows() {
  return COMPARE_ROWS.filter((r) => DEPLOYMENT.assets[r.assetId]).map((r) => {
    const a = DEPLOYMENT.assets[r.assetId];
    const depthToDebt = a.depthUsd / Math.max(1, a.debtUsd); // ComparePanel.tsx:79
    return {
      ...r,
      asset: a,
      chain: (isEthereumBook(a) ? "ethereum" : "monad") as BookChain,
      /** Symbol without the " (Ethereum)" suffix (ComparePanel.tsx:86). */
      symbol: symbolParts(a).base,
      debtUsd: a.debtUsd,
      depthUsd: a.depthUsd,
      depthIsAssumption: a.depthIsAssumption,
      depthToDebt,
      thinDepth: depthToDebt < THIN_DEPTH_TO_DEBT,
    };
  });
}

export type CompareRow = ReturnType<typeof compareRows>[number];

/** Same shock / oracle / path, real book of each row (ComparePanel.tsx:35-41). */
export function compareScenario(assetId: number, p: CompareParams): Scenario {
  const a: AssetInfo = DEPLOYMENT.assets[assetId];
  return {
    assetId,
    shockBps: p.shockBps,
    steps: p.steps,
    maxRoundsPerStep: p.rounds,
    maxPositions: a.realPositions,
    oracleFeedbackBps: p.feedback,
  };
}

/** Row result numbers (ComparePanel.tsx:95-98); null while loading or when the preview failed. */
export function compareResultFacts(r: Result | null) {
  return r ? { badDebtUsd: wadToNum(r.badDebt), stuckDebtUsd: wadToNum(r.stuckDebt), hasBadDebt: r.badDebt > 0n, hasStuckDebt: r.stuckDebt > 0n } : null;
}

/**
 * Ratios behind the table's footnote (ComparePanel.tsx:105-109), from deployment.json instead of the
 * legacy "~48x" / "11x" / "hundreds of times" literals.
 */
export function compareNotes() {
  const a = DEPLOYMENT.assets;
  const usdeEth = a[14];
  const usdeMonad = a[2];
  const usdcEth = a[13];
  return {
    usdeDepthMultiple: usdeEth && usdeMonad ? usdeEth.depthUsd / usdeMonad.depthUsd : null,
    usdeDebtMultiple: usdeEth && usdeMonad ? usdeEth.debtUsd / usdeMonad.debtUsd : null,
    /** Legacy copy said "hundreds of times the debt"; the deployment data gives this ratio. */
    usdcDepthToDebt: usdcEth ? usdcEth.depthUsd / Math.max(1, usdcEth.debtUsd) : null,
  };
}
