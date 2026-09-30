// Event decoders for Kaskad receipts. No "use client": the proof flows (actions/*) and Server
// Components (the proof ledger on /how-it-works) both decode receipts with these.

import { decodeEventLog, type Hex } from "viem";
import { guardAbi, kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";

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

/** Guard's GuardChecked event (contracts/src/Guard.sol:25): the decision refresh() took. */
export type GuardChecked = { simId: Hex; badDebtRatioBps: bigint; liquidationRatioBps: bigint; tripped: boolean };

/** GuardChecked from the Guard's own logs (the engine's logs in the same receipt are skipped). */
export function findGuardChecked(logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[], guard: string): GuardChecked | null {
  for (const l of logs) {
    if (l.address.toLowerCase() !== guard.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: guardAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "GuardChecked") return { ...ev.args };
    } catch {}
  }
  return null;
}
