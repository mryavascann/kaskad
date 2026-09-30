"use client";

// Shared transaction flow for the proof actions: optional >= 1 MON confirmation, then the chain
// layer's sendTx() unchanged, with its status strings and errors translated to typed events.

import type { Address, Hex, TransactionReceipt } from "viem";
import { sendTx, signerStore, type Sent, type SignerKind } from "@/lib/kaskad/signer";
import { decideCost, type ConfirmCost } from "./cost";
import { toTxEvent, txError, type TxError, type TxEvent, type TxStep } from "./status";

export type SendFn = (to: Address, data: Hex, gas: bigint, onStatus: (s: string) => void) => Promise<Sent>;

export type TxOptions = {
  /** Progress events (typed; the original string is in `raw`). */
  onEvent?: (e: TxEvent) => void;
  /** Asked before spending >= 1 MON; without it such a tx is cancelled ("confirm-required"). */
  confirm?: ConfirmCost;
  /** Signer kind for the cost quote (default: the active signer). */
  signerKind?: SignerKind;
  /** Injection point for tests; default: sendTx from lib/kaskad/signer.ts (the only tx entry point). */
  send?: SendFn;
};

export type TxReceiptInfo = { hash: Hex; ms: number; sync: boolean; receipt: TransactionReceipt };

/**
 * Typed result of a proof action. `C` / `R`: extras an action adds to a confirmed / reverted tx
 * (decoded events, re-read market state). "cancelled": the >= 1 MON confirmation was declined or not
 * provided, or the contract is missing from the deployment. Reverted txs still cost MON.
 */
export type TxOutcome<C = unknown, R = unknown> =
  | ({ status: "confirmed" } & TxReceiptInfo & C)
  | ({ status: "reverted" } & TxReceiptInfo & R)
  | { status: "cancelled"; reason: "declined" | "confirm-required" | "unavailable" }
  | { status: "failed"; error: TxError };

/**
 * Optional cost gate, then sendTx() (lib/kaskad/signer.ts:103-160) with its status strings mapped to
 * TxEvents, then the receipt status. Errors never throw out of here: they become `failed` outcomes.
 */
export async function runTx(
  req: { to: Address; data: Hex; gas: bigint; confirmGate: boolean },
  opts: TxOptions = {},
): Promise<TxOutcome> {
  const emit = opts.onEvent ?? (() => {});
  if (req.confirmGate) {
    const decision = await decideCost(req.gas, opts.signerKind ?? signerStore.get().kind, opts.confirm);
    if (decision === "declined" || decision === "confirm-required") return { status: "cancelled", reason: decision };
  }
  let phase: TxStep | null = null;
  try {
    const sent = await (opts.send ?? sendTx)(req.to, req.data, req.gas, (raw) => {
      const ev = toTxEvent(raw);
      phase = ev.step;
      emit(ev);
    });
    const info: TxReceiptInfo = { hash: sent.receipt.transactionHash, ms: sent.ms, sync: sent.sync, receipt: sent.receipt };
    if (sent.receipt.status === "success") {
      emit({ step: "confirmed", raw: "" });
      return { status: "confirmed", ...info };
    }
    emit({ step: "failed", detail: "reverted", raw: "" });
    return { status: "reverted", ...info };
  } catch (e) {
    const error = txError(e, phase);
    emit({ step: "failed", detail: error.code, raw: error.raw });
    return { status: "failed", error };
  }
}

/** Failure outcome for errors raised before sending (preview / pre-check), with its event. */
export function failBeforeSend(e: unknown, opts: TxOptions): { status: "failed"; error: TxError } {
  const error = txError(e);
  opts.onEvent?.({ step: "failed", detail: error.code, raw: error.raw });
  return { status: "failed", error };
}
