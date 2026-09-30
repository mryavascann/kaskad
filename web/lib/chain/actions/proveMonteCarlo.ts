"use client";

import { encodeFunctionData } from "viem";
import { kaskadMCAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { MC_SEED } from "../engine-model";
import { findMonteCarloDone, type MonteCarloDone } from "../events";
import { runTx, type TxOptions, type TxOutcome } from "../tx";
import { proveMonteCarloGasLimit } from "./gas";
import type { MonteCarloResult, Scenario } from "../types";

export { findMonteCarloDone, type MonteCarloDone };


export type ProveMonteCarloOutcome = TxOutcome<{ paths: number; monteCarloDone: MonteCarloDone | null }>;

export { proveMonteCarloGasLimit };

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

