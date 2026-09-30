"use client";

import { decodeEventLog, encodeFunctionData, type Hex } from "viem";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { engineFor } from "../engine";
import { runTx, type TxOptions, type TxOutcome } from "../tx";
import type { Result, Scenario } from "../types";

/** Fields of the engine's SimulationDone event (contracts/src/Kaskad.sol:98-109). */
export type SimulationDone = {
  simId: Hex;
  totalLiquidated: bigint;
  totalBadDebt: bigint;
  rounds: bigint;
  positionsUsed: bigint;
  gasUsed: bigint;
  memoryBytes: bigint;
};

export type ProveScenarioOutcome = TxOutcome<{ rounds: number; simulationDone: SimulationDone | null }>;

/** simulate() gas limit from the preview (Protocol.tsx:245). Monad charges the limit. */
export const proveScenarioGasLimit = (preview: Pick<Result, "gasUsed" | "rounds">): bigint =>
  simulateGasLimit(preview.gasUsed, preview.rounds);

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

/** Decodes the first SimulationDone log (Protocol.tsx:255-263); null when absent. */
export function findSimulationDone(logs: readonly { data: Hex; topics: readonly Hex[] }[]): SimulationDone | null {
  for (const l of logs) {
    try {
      const ev = decodeEventLog({ abi: kaskadAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "SimulationDone") {
        const a = ev.args;
        return {
          simId: a.simId,
          totalLiquidated: a.totalLiquidated,
          totalBadDebt: a.totalBadDebt,
          rounds: a.rounds,
          positionsUsed: a.positionsUsed,
          gasUsed: a.gasUsed,
          memoryBytes: a.memoryBytes,
        };
      }
    } catch {}
  }
  return null;
}
