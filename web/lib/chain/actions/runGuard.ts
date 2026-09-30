"use client";

import { decodeEventLog, encodeFunctionData, type Hex } from "viem";
import { guardAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { guardGasLimit, readMarkets, type MarketId } from "../guard";
import type { ChainReader } from "../reader";
import { failBeforeSend, runTx, type TxOptions, type TxOutcome } from "../tx";
import type { MarketState } from "../types";

/** Guard's GuardChecked event (contracts/src/Guard.sol:25): the decision refresh() took. */
export type GuardChecked = { simId: Hex; badDebtRatioBps: bigint; liquidationRatioBps: bigint; tripped: boolean };

type Markets = { markets: Record<MarketId, MarketState> | null };
export type RunGuardOutcome = TxOutcome<{ checked: GuardChecked | null } & Markets, Markets>;

/**
 * "Run the Guard" (GuardPanel.tsx:119-137): preview the Guard's scenario to size the tx
 * (+150k overhead), >= 1 MON confirmation, Guard.refresh(), decode GuardChecked, re-read both
 * markets. Spends MON.
 */
export async function runGuard(opts: TxOptions & { reader?: ChainReader } = {}): Promise<RunGuardOutcome> {
  opts.onEvent?.({ step: "preparing", detail: "guard-scenario", raw: "" });
  let gas: bigint;
  try {
    gas = await guardGasLimit({ reader: opts.reader });
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  const guard = DEPLOYMENT.contracts.guard;
  const out = await runTx({ to: guard, data: encodeFunctionData({ abi: guardAbi, functionName: "refresh" }), gas, confirmGate: true }, opts);
  if (out.status === "cancelled" || out.status === "failed") return out;
  const markets = await readMarkets(opts.reader).catch(() => null);
  if (out.status === "reverted") return { ...out, markets };
  return { ...out, checked: findGuardChecked(out.receipt.logs, guard), markets };
}

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
