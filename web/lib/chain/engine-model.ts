// Pure part of the engine wrappers (no viem, no network): engine routing, gas cap, preview error
// classification, Monte Carlo constants and facts. engine.ts re-exports all of it; client views
// import from here so the read client (viem) loads only when a hook actually reads.

import type { Address } from "viem";
import { CALIBRATED, DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { MONAD_MEMORY_LIMIT, MONAD_TX_GAS_LIMIT } from "@/lib/kaskad/math";
import type { MonteCarloResult } from "./types";

/**
 * eth_call gas = the Monad per-tx limit, so "preview succeeds" means "fits in one tx"
 * (useKaskad.ts:54-57, MonteCarlo.tsx:42). Out of gas is how "does not fit" is detected.
 */
export const PREVIEW_GAS = BigInt(MONAD_TX_GAS_LIMIT);

/**
 * Real books run on KaskadMC (same cascade + inter-block arbitrage recovery, reading Kaskad's
 * books); calibrated books (id >= 256) run on Kaskad itself. useKaskad.ts:45-52.
 */
export function engineFor(assetId: number): Address {
  return assetId >= CALIBRATED || !DEPLOYMENT.contracts.kaskadMC
    ? DEPLOYMENT.contracts.kaskad
    : DEPLOYMENT.contracts.kaskadMC;
}

// ------------------------------------------------------------------ preview errors

export type PreviewErrorCode = "out-of-gas" | "failed";
export type PreviewError = { code: PreviewErrorCode; raw: string; shortMessage?: string };

/**
 * Legacy classification (useKaskad.ts:96-99): `/gas|out of/i` on the error message -> "out-of-gas"
 * ("does not fit in one tx"), anything else -> "failed". Kept verbatim. Note: viem's
 * CallExecutionError message lists the call arguments (including `gas: 30000000`), so almost every
 * eth_call failure matches; `shortMessage` carries viem's short reason for diagnostics.
 */
export function previewError(e: unknown): PreviewError {
  const raw = String((e as Error)?.message ?? e);
  const shortMessage = (e as { shortMessage?: unknown })?.shortMessage;
  return {
    code: /gas|out of/i.test(raw) ? "out-of-gas" : "failed",
    raw,
    ...(typeof shortMessage === "string" ? { shortMessage } : {}),
  };
}

// ------------------------------------------------------------------ Monte Carlo (KaskadMC)

/** Seed of every Monte Carlo run in the app (MonteCarlo.tsx:34). */
export const MC_SEED = 1n;
/** Largest K the contract accepts: KaskadMC.MAX_PATHS (contracts/src/KaskadMC.sol:14, MonteCarlo.tsx:35). */
export const MC_MAX_PATHS = 2_000;
/** Default K of the Monte Carlo panel (MonteCarlo.tsx:60). */
export const MC_DEFAULT_PATHS = 30;
/** K slider max before "find the limit" ran (MonteCarlo.tsx:143). */
export const MC_SLIDER_MAX = 100;
/** Path model: final shock = S * 3u^2, so the mean is S and a path is at most 3x S (KaskadMC.sol:9, :153). */
export const MC_MAX_SHOCK_MULTIPLE = 3;

/** Whether the deployment has the Monte Carlo engine (the legacy panel renders nothing without it). */
export const monteCarloAvailable = (): boolean => Boolean(DEPLOYMENT.contracts.kaskadMC);

/** Numbers the Monte Carlo panel shows (MonteCarlo.tsx:122-204), USD as plain numbers. */
export function monteCarloFacts(mc: MonteCarloResult) {
  const paths = Number(mc.paths);
  const gasUsed = Number(mc.gasUsed);
  const memoryBytes = Number(mc.memoryBytes);
  return {
    paths,
    positionsUsed: Number(mc.positionsUsed),
    /** Position-scenarios evaluated in the one call: K x positions (MonteCarlo.tsx:217-219). */
    positionScenarios: paths * Number(mc.positionsUsed),
    totalDebtUsd: wadToNum(mc.totalDebt),
    meanBadDebtUsd: wadToNum(mc.meanBadDebt),
    p95BadDebtUsd: wadToNum(mc.p95BadDebt),
    worstBadDebtUsd: wadToNum(mc.worstBadDebt),
    worstShockPct: Number(mc.worstShockBps) / 100,
    meanShockPct: Number(mc.meanShockBps) / 100,
    lossPaths: Number(mc.lossPaths),
    /** Share of paths with any bad debt (MonteCarlo.tsx:158). */
    lossPathShare: Number(mc.lossPaths) / paths,
    gasUsed,
    gasFraction: gasUsed / MONAD_TX_GAS_LIMIT,
    memoryBytes,
    memoryFraction: memoryBytes / MONAD_MEMORY_LIMIT,
    /** Scatter points, one per path (MonteCarlo.tsx:123-125; USD, not the legacy $M units). */
    points: mc.shockBps.map((sh, i) => ({ shockPct: Number(sh) / 100, badDebtUsd: wadToNum(mc.badDebt[i]) })),
  };
}
