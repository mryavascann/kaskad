// Proof ledger: transactions sent on Monad testnet as evidence (root README, "Kanıt"), read back from
// the chain instead of copied: the scenario from the calldata, the result from the event, gas and
// status from the receipt, the date from the block. Server-safe (used by /how-it-works at build time).

import { decodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { guardAbi, kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import {
  findGuardChecked,
  findMonteCarloDone,
  findSimulationDone,
  type GuardChecked,
  type MonteCarloDone,
  type SimulationDone,
} from "./events";
import { defaultReader } from "./reader";
import type { Scenario } from "./types";

export type ProofKind = "cascade" | "monte-carlo" | "guard";

/** Ids are stable keys for copy (pages describe each proof in their own language). */
export const PROOF_TXS = [
  { id: "finding", kind: "cascade", hash: "0xc80dfd34835edcba1028b76945f4793598cf3b27bee470e79cffdd75b8a53a99" },
  { id: "finding-pool-oracle", kind: "cascade", hash: "0xb0a5d7d76f17c728f6b33f0a58cd049ab3d5a6149e9288a83086d4a60a8a288b" },
  { id: "scale", kind: "cascade", hash: "0x661facb56395f553be94399d004f0ca75834cc2f5037f54d37adff832d6d185c" },
  { id: "monte-carlo", kind: "monte-carlo", hash: "0x1dbadcecf6248281f71c63b41552092f03d1eb2a75dd793e4cd1985f272c42ce" },
  { id: "monte-carlo-pool-oracle", kind: "monte-carlo", hash: "0x124fedb1e345dbc68ac800c9bf6bccd108d2a16c9188d8c618cb3d87ada7635f" },
  { id: "guard", kind: "guard", hash: "0xf779c8a68fcee03c9f4c7d10c297006efdbe85b24450826c496d5eb022693aa3" },
] as const satisfies readonly { id: string; kind: ProofKind; hash: Hex }[];

export type ProofId = (typeof PROOF_TXS)[number]["id"];

export type ProofRecord = {
  id: ProofId;
  kind: ProofKind;
  hash: Hex;
  to: Address | null;
  status: "success" | "reverted";
  blockNumber: bigint;
  /** Block time, ms since epoch. */
  timestamp: number;
  /** Gas the transaction consumed (receipt), not the engine's own measurement. */
  gasUsed: bigint;
  /** Scenario decoded from the calldata of simulate / simulateMC; null for Guard.refresh(). */
  scenario: Scenario | null;
  /** Monte Carlo paths requested in the calldata. */
  paths: bigint | null;
  simulation: SimulationDone | null;
  monteCarlo: MonteCarloDone | null;
  guard: GuardChecked | null;
};

export type ProofReader = Pick<PublicClient, "getTransaction" | "getTransactionReceipt" | "getBlock">;

type Entry = (typeof PROOF_TXS)[number];

/** Decodes one proof transaction. Pure apart from the three reads. */
export async function readProof(entry: Entry, reader: ProofReader = defaultReader() as unknown as ProofReader): Promise<ProofRecord> {
  const [tx, receipt] = await Promise.all([reader.getTransaction({ hash: entry.hash }), reader.getTransactionReceipt({ hash: entry.hash })]);
  const block = await reader.getBlock({ blockNumber: receipt.blockNumber });

  let scenario: Scenario | null = null;
  let paths: bigint | null = null;
  if (entry.kind === "cascade") {
    const call = decodeFunctionData({ abi: kaskadAbi, data: tx.input });
    if (call.functionName === "simulate") scenario = { ...call.args[0] };
  } else if (entry.kind === "monte-carlo") {
    const call = decodeFunctionData({ abi: kaskadMCAbi, data: tx.input });
    if (call.functionName === "simulateMC") {
      scenario = { ...call.args[0] };
      paths = call.args[1];
    }
  } else {
    // Guard.refresh() has no arguments; the decision is in the GuardChecked event.
    decodeFunctionData({ abi: guardAbi, data: tx.input });
  }

  return {
    id: entry.id,
    kind: entry.kind,
    hash: entry.hash,
    to: tx.to ?? null,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    timestamp: Number(block.timestamp) * 1000,
    gasUsed: receipt.gasUsed,
    scenario,
    paths,
    simulation: entry.kind === "cascade" ? findSimulationDone(receipt.logs) : null,
    monteCarlo: entry.kind === "monte-carlo" ? findMonteCarloDone(receipt.logs) : null,
    guard: entry.kind === "guard" ? findGuardChecked(receipt.logs, DEPLOYMENT.contracts.guard) : null,
  };
}

export type ProofResult = { ok: true; record: ProofRecord } | { ok: false; id: ProofId; hash: Hex; error: string };

/** Every proof, one failure never hides the others. */
export async function readProofs(reader?: ProofReader): Promise<ProofResult[]> {
  return Promise.all(
    PROOF_TXS.map((entry) =>
      readProof(entry, reader).then(
        (record): ProofResult => ({ ok: true, record }),
        (e: unknown): ProofResult => ({ ok: false, id: entry.id, hash: entry.hash, error: String((e as Error)?.message ?? e) }),
      ),
    ),
  );
}
