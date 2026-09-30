"use client";

import { encodeFunctionData, type Address } from "viem";
import { mockMarketAbi } from "@/lib/kaskad/abi";
import { BORROW_AMOUNT, BORROW_GAS, readMarkets, type MarketId } from "../guard";
import { defaultReader, type ChainReader } from "../reader";
import { loadSigner } from "../signer";
import { failBeforeSend, runTx, type TxOptions, type TxOutcome } from "../tx";
import type { MarketState } from "../types";

type Markets = { markets: Record<MarketId, MarketState> | null };
export type BorrowOutcome = TxOutcome<{ amount: bigint } & Markets, Markets>;

/**
 * "Try to borrow" (GuardPanel.tsx:139-163): a free eth_call pre-check first, so a paused market fails
 * with `borrow-paused` without spending anything, then borrow(1,000e18) with an 80k limit (no
 * confirmation: far below 1 MON), then both markets re-read. Spends MON when the pre-check passes.
 */
export async function borrow(market: Address, opts: TxOptions & { reader?: ChainReader; account?: Address } = {}): Promise<BorrowOutcome> {
  const reader = opts.reader ?? defaultReader();
  try {
    const account = opts.account ?? (await loadSigner()).signerStore.get().address ?? undefined;
    await reader.simulateContract({
      account,
      address: market,
      abi: mockMarketAbi,
      functionName: "borrow",
      args: [BORROW_AMOUNT],
    });
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  const data = encodeFunctionData({ abi: mockMarketAbi, functionName: "borrow", args: [BORROW_AMOUNT] });
  const out = await runTx({ to: market, data, gas: BORROW_GAS, confirmGate: false }, opts);
  if (out.status === "cancelled" || out.status === "failed") return out;
  const markets = await readMarkets(reader).catch(() => null);
  if (out.status === "reverted") return { ...out, markets };
  return { ...out, amount: BORROW_AMOUNT, markets };
}
