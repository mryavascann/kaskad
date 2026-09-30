"use client";

import { decodeEventLog, encodeFunctionData, type Hex } from "viem";
import { kaskadMCAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { monteCarloGasLimit } from "@/lib/kaskad/math";
import { MC_SEED } from "../engine";
import { runTx, type TxOptions, type TxOutcome } from "../tx";
import type { MonteCarloResult, Scenario } from "../types";

/** Fields of KaskadMC's MonteCarloDone event (contracts/src/KaskadMC.sol:40-51). */
export type MonteCarloDone = {
  simId: Hex;
  paths: bigint;
  meanBadDebt: bigint;
  p95BadDebt: bigint;
  worstBadDebt: bigint;
  gasUsed: bigint;
  memoryBytes: bigint;
};

export type ProveMonteCarloOutcome = TxOutcome<{ paths: number; monteCarloDone: MonteCarloDone | null }>;

/** simulateMC gas limit from the preview (MonteCarlo.tsx:105). */
export const proveMonteCarloGasLimit = (preview: Pick<MonteCarloResult, "gasUsed">): bigint => monteCarloGasLimit(preview.gasUsed);

/**
 * K paths in one on-chain tx (MonteCarlo.tsx:103-119): simulateMC(base, paths, seed 1) on KaskadMC,
 * limit sized from the preview of the same K, >= 1 MON confirmation. Spends MON.
 */
export async function proveMonteCarlo(
  base: Scenario,
  paths: number,
  preview: MonteCarloResult,
  opts: TxOptions = {},
): Promise<ProveMonteCarloOutcome> {
  const mc = DEPLOYMENT.contracts.kaskadMC;
  if (!mc) return { status: "cancelled", reason: "unavailable" };
  const data = encodeFunctionData({ abi: kaskadMCAbi, functionName: "simulateMC", args: [base, BigInt(paths), MC_SEED] });
  const out = await runTx({ to: mc, data, gas: proveMonteCarloGasLimit(preview), confirmGate: true }, opts);
  if (out.status !== "confirmed") return out;
  return { ...out, paths, monteCarloDone: findMonteCarloDone(out.receipt.logs) };
}

export function findMonteCarloDone(logs: readonly { data: Hex; topics: readonly Hex[] }[]): MonteCarloDone | null {
  for (const l of logs) {
    try {
      const ev = decodeEventLog({ abi: kaskadMCAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "MonteCarloDone") {
        const a = ev.args;
        return {
          simId: a.simId,
          paths: a.paths,
          meanBadDebt: a.meanBadDebt,
          p95BadDebt: a.p95BadDebt,
          worstBadDebt: a.worstBadDebt,
          gasUsed: a.gasUsed,
          memoryBytes: a.memoryBytes,
        };
      }
    } catch {}
  }
  return null;
}
