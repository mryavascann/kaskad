"use client";

import { encodeFunctionData } from "viem";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { engineFor } from "../engine-model";
import { findSimulationDone, type SimulationDone } from "../events";
import { runTx, type TxOptions, type TxOutcome } from "../tx";
import { proveScenarioGasLimit } from "./gas";
import type { Result, Scenario } from "../types";

export { findSimulationDone, type SimulationDone };


export type ProveScenarioOutcome = TxOutcome<{ rounds: number; simulationDone: SimulationDone | null }>;

export { proveScenarioGasLimit };

/**
 * "Prove on chain" (Protocol.tsx:247-274): simulate(scenario) on engineFor(assetId) with the limit
 * sized from `preview` (the free preview of the same scenario), >= 1 MON confirmation, then the
 * SimulationDone event decoded from the receipt. Spends MON: never call it from tests or scripts.
 */
export async function proveScenario(scenario: Scenario, preview: Result, opts: TxOptions = {}): Promise<ProveScenarioOutcome> {
  const data = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] });
  const out = await runTx({ to: engineFor(scenario.assetId), data, gas: proveScenarioGasLimit(preview), confirmGate: true }, opts);
  if (out.status !== "confirmed") return out;
  return { ...out, rounds: preview.rounds, simulationDone: findSimulationDone(out.receipt.logs) };
}

