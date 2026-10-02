"use client";

import { createPasskeyWithPrfOutput, createSecp256k1SigningSession, getPasskeyPrfOutput } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";
import { derivePasskeyKeys, type PasskeyKeys } from "./passkey-keys";

// Mera (Category Labs) passkey wallet: the EVM key is derived from the passkey's WebAuthn PRF
// output; nothing is stored server-side. We only need the address here (read-only screen).
const KEY = "kaskad.mera.credential";

function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  return node.privateKey;
}

/**
 * "login": use the passkey remembered on this device, or let the browser offer any discoverable
 * Kaskad passkey. "create": make a new passkey (a new wallet). The key lives only in the returned
 * signing session, in memory; nothing secret is stored.
 */
export async function connectMera(mode: "login" | "create" = "login"): Promise<LocalAccount> {
  return (await connectMeraSession(mode)).account;
}

/**
 * Same as connectMera, plus `end`: zeroes the session's key copy (sign out); later signing throws.
 * `keys`: the private-watchlist keys derived from the same PRF output (passkey-keys.ts), so one
 * passkey prompt gives the wallet and the watchlist.
 */
export async function connectMeraSession(
  mode: "login" | "create" = "login",
): Promise<{ account: LocalAccount; keys: PasskeyKeys; end: () => void }> {
  const rpId = location.hostname;
  let prf: Uint8Array;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {}
  if (mode === "login") {
    prf = (await getPasskeyPrfOutput({ rpId, credential: stored ? JSON.parse(stored) : undefined })).prfOutput;
  } else {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId, name: "Kaskad" },
      user: { name: "kaskad-user", displayName: "Kaskad" },
    });
    try {
      localStorage.setItem(KEY, JSON.stringify({ credentialId: created.credentialId, transports: created.transports }));
    } catch {}
    prf = created.prfOutput;
  }
  const key = deriveEvmKey(prf);
  const keys = await derivePasskeyKeys(prf);
  prf.fill(0);
  const session = createSecp256k1SigningSession({ privateKey: key });
  key.fill(0);
  return { account: toViemAccount(session), keys, end: () => session.end() };
}

export function hasStoredMeraPasskey(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
