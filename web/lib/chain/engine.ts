// Free engine previews (eth_call). Behavior copied from app/_components/useKaskad.ts and
// app/_components/MonteCarlo.tsx: same engine routing, same 30M gas cap, same decoding.
// Every read takes an optional `reader` (default: defaultReader()) so it also runs on the server.

import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";
import { kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";
import { CALIBRATED, DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { MONAD_MEMORY_LIMIT, MONAD_TX_GAS_LIMIT } from "@/lib/kaskad/math";
import { defaultReader, type ChainReader } from "./reader";
import type { CurveResult, MonteCarloResult, Result, Scenario } from "./types";

/**
 * eth_call gas = the Monad per-tx limit, so "preview succeeds" means "fits in one tx"
 * (useKaskad.ts:54-57, MonteCarlo.tsx:42). Out of gas is how "does not fit" is detected.
 */
export const PREVIEW_GAS = BigInt(MONAD_TX_GAS_LIMIT);

export type ReadOptions = {
  reader?: ChainReader;
  /** Pin the eth_call to a block (default: latest). */
  blockNumber?: bigint;
};

export type PreviewOptions = ReadOptions & {
  /** Run on this engine instead of engineFor(assetId), e.g. the Guard's own engine. */
  engine?: Address;
};

/**
 * Real books run on KaskadMC (same cascade + inter-block arbitrage recovery, reading Kaskad's
 * books); calibrated books (id >= 256) run on Kaskad itself. useKaskad.ts:45-52.
 */
export function engineFor(assetId: number): Address {
  return assetId >= CALIBRATED || !DEPLOYMENT.contracts.kaskadMC
    ? DEPLOYMENT.contracts.kaskad
    : DEPLOYMENT.contracts.kaskadMC;
}

/** eth_call with the Monad per-tx gas limit (useKaskad.ts:55-60). Encoded with kaskadAbi for both engines. */
async function call30M(
  functionName: "preview" | "previewCurve",
  args: readonly unknown[],
  assetId: number,
  opts: PreviewOptions,
) {
  const data = encodeFunctionData({ abi: kaskadAbi, functionName, args: args as never });
  const reader = opts.reader ?? defaultReader();
  const res = await reader.call({
    to: opts.engine ?? engineFor(assetId),
    data,
    gas: PREVIEW_GAS,
    ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
  });
  if (!res.data) throw new Error("empty eth_call result");
  return decodeFunctionResult({ abi: kaskadAbi, functionName, data: res.data });
}

/** Free dry run of one scenario (useKaskad.ts:62-64). Throws on revert / out of gas / network. */
export async function previewScenario(s: Scenario, opts: PreviewOptions = {}): Promise<Result> {
  return (await call30M("preview", [s], s.assetId, opts)) as unknown as Result;
}

/** Stress curve: the scenario at several shock levels in one eth_call (useKaskad.ts:66-74). */
export async function previewCurve(s: Scenario, shocksBps: readonly number[], opts: PreviewOptions = {}): Promise<CurveResult> {
  const [bad, liq, gasUsed, memoryBytes] = (await call30M("previewCurve", [s, shocksBps], s.assetId, opts)) as unknown as [
    readonly bigint[],
    readonly bigint[],
    bigint,
    bigint,
  ];
  return { bad, liq, gasUsed, memoryBytes };
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

/**
 * K random paths in one eth_call (MonteCarlo.tsx:37-48). Returns null when it does not fit in 30M
 * gas, is invalid, or there is no KaskadMC (legacy semantics: any failure -> null).
 */
export async function previewMonteCarlo(
  s: Scenario,
  paths: number,
  opts: ReadOptions & { seed?: bigint } = {},
): Promise<MonteCarloResult | null> {
  const mc = DEPLOYMENT.contracts.kaskadMC;
  if (!mc) return null;
  const data = encodeFunctionData({ abi: kaskadMCAbi, functionName: "previewMC", args: [s, BigInt(paths), opts.seed ?? MC_SEED] });
  try {
    const res = await (opts.reader ?? defaultReader()).call({
      to: mc,
      data,
      gas: PREVIEW_GAS,
      ...(opts.blockNumber !== undefined ? { blockNumber: opts.blockNumber } : {}),
    });
    if (!res.data) return null;
    return decodeFunctionResult({ abi: kaskadMCAbi, functionName: "previewMC", data: res.data }) as unknown as MonteCarloResult;
  } catch {
    return null; // out of gas at 30M (or invalid): does not fit in one transaction
  }
}

export type MaxPathsResult = { k: number; result: MonteCarloResult | null; probes: number };

/**
 * Largest K that still fits in 30M gas, by binary search over eth_call (MonteCarlo.tsx:85-101):
 * ~11 sequential free calls for K in [0, 2000]. `signal` stops early (returns the best so far).
 */
export async function findMaxPaths(
  s: Scenario,
  opts: ReadOptions & { maxPaths?: number; signal?: AbortSignal; onProbe?: (k: number, fits: boolean) => void } = {},
): Promise<MaxPathsResult> {
  let lo = 0;
  let hi = opts.maxPaths ?? MC_MAX_PATHS;
  let best: MonteCarloResult | null = null;
  let probes = 0;
  while (lo < hi) {
    if (opts.signal?.aborted) break;
    const mid = Math.floor((lo + hi + 1) / 2);
    const res = await previewMonteCarlo(s, mid, opts);
    probes++;
    opts.onProbe?.(mid, res !== null);
    if (res) {
      lo = mid;
      best = res;
    } else hi = mid - 1;
  }
  return { k: lo, result: best, probes };
}

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
