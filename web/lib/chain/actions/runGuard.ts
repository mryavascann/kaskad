"use client";

import { encodeFunctionData } from "viem";
import { guardAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { findGuardChecked, type GuardChecked } from "../events";
import { guardGasLimit, readMarkets, type MarketId } from "../guard";
import type { ChainReader } from "../reader";
import { failBeforeSend, runTx, type TxOptions, type TxOutcome } from "../tx";
import type { MarketState } from "../types";

export { findGuardChecked, type GuardChecked };


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

