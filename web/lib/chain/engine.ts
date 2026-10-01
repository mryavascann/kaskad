// Free engine previews (eth_call). Behavior copied from app/_components/useKaskad.ts and
// app/_components/MonteCarlo.tsx: same engine routing, same 30M gas cap, same decoding.
// Every read takes an optional `reader` (default: defaultReader()) so it also runs on the server.

import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";
import { kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { engineFor, MC_MAX_PATHS, MC_SEED, PREVIEW_GAS } from "./engine-model";
import { defaultReader, type ChainReader } from "./reader";
import type { CurveResult, MonteCarloResult, Result, Scenario } from "./types";

// Pure parts (routing, gas cap, errors, Monte Carlo constants and facts) live in engine-model.ts.
export * from "./engine-model";

export type ReadOptions = {
  reader?: ChainReader;
  /** Pin the eth_call to a block (default: latest). */
  blockNumber?: bigint;
};

export type PreviewOptions = ReadOptions & {
  /** Run on this engine instead of engineFor(assetId), e.g. the Guard's own engine. */
  engine?: Address;
};

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

// ------------------------------------------------------------------ Monte Carlo (KaskadMC)

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
