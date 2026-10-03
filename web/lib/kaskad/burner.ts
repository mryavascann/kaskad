"use client";

import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { TESTNET_RPC } from "./config";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, type SendResult } from "./tx";

// Testnet-only throwaway key for this app. It only ever pays gas; it never transfers MON.
const KEY = "kaskad.burner.v1";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(TESTNET_RPC, { batch: true }),
}) as PublicClient;

let account: PrivateKeyAccount | null = null;
let nonce: number | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function getBurner(): PrivateKeyAccount {
  if (account) return account;
  let pk: string | null = null;
  try {
    pk = localStorage.getItem(KEY);
  } catch {}
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey();
    try {
      localStorage.setItem(KEY, pk);
    } catch {}
  }
  account = privateKeyToAccount(pk as Hex);
  return account;
}

export type Status = (s: string) => void;

/**
 * Makes sure `address` (default: the burner) can pay `needWei` of gas: asks the sponsor route and waits
 * for the balance. The status string is the one lib/chain/status.ts maps to the "fund" step.
 */
export async function ensureFunded(needWei: bigint, onStatus: Status, address?: Address): Promise<void> {
  const target = address ?? getBurner().address;
  let bal = await publicClient.getBalance({ address: target });
  if (bal >= needWei) return;
  onStatus("Burner cüzdan hazırlanıyor (sponsor fonluyor)…");
  const res = await fetch("/api/fund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: target, needWei: needWei.toString() }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `fonlama başarısız (${res.status})`);
  // Newly funded accounts need ~3 blocks before they can send; wait until we see the balance.
  const t0 = Date.now();
  while (Date.now() - t0 < 20_000) {
    await new Promise((r) => setTimeout(r, 400));
    bal = await publicClient.getBalance({ address: target });
    if (bal >= needWei) {
      await new Promise((r) => setTimeout(r, 1_000));
      return;
    }
  }
  throw new Error("fonlama zaman aşımı");
}

/** One tx at a time per burner; local nonce, fixed gas and fees, sync send. */
export function sendBurnerTx(to: Address, data: Hex, gas: bigint): Promise<SendResult> {
  const job = queue.then(async () => {
    const acct = getBurner();
    if (nonce === null) nonce = await publicClient.getTransactionCount({ address: acct.address, blockTag: "pending" });
    const sign = (tipBump: bigint) =>
      acct.signTransaction({
        chainId: monadTestnet.id,
        type: "eip1559",
        to,
        data,
        gas,
        nonce: nonce!,
        maxFeePerGas: MAX_FEE_PER_GAS + tipBump,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS + tipBump,
      });
    try {
      const r = await sendRawSync(publicClient, await sign(0n));
      nonce!++;
      return r;
    } catch (e) {
      // A node may cache the rejection of an identical raw tx: re-sign with tip + 1 wei once.
      if (/nonce/i.test(String((e as Error).message))) nonce = null;
      else {
        const r = await sendRawSync(publicClient, await sign(1n));
        nonce!++;
        return r;
      }
      throw e;
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
