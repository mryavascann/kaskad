"use client";

// Read-only address lookups for the wallet-risk page (app/(legacy)/cuzdan/Wallet.tsx:69-86).
// Neither changes the active signer nor switches the wallet's chain.

import type { Address } from "viem";
import { connectError, type ConnectErrorCode } from "./status";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export type AddressLookup = { ok: true; address: Address } | { ok: false; code: ConnectErrorCode; raw: string };

/** Mera passkey address: login with the stored passkey, or create one (Wallet.tsx:69-79). */
export async function readMeraAddress(): Promise<AddressLookup> {
  try {
    const { connectMera, hasStoredMeraPasskey } = await import("@/lib/kaskad/mera");
    const account = await connectMera(hasStoredMeraPasskey() ? "login" : "create");
    return { ok: true, address: account.address };
  } catch (e) {
    return { ok: false, ...connectError(e) };
  }
}

/** Browser wallet address via eth_requestAccounts (Wallet.tsx:81-86). */
export async function readInjectedAddress(): Promise<AddressLookup> {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) return { ok: false, code: "no-wallet", raw: "" };
  try {
    const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
    return address ? { ok: true, address } : { ok: false, code: "rejected", raw: "" };
  } catch (e) {
    return { ok: false, ...connectError(e) };
  }
}
