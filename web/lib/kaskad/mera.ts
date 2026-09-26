"use client";

import { createPasskeyWithPrfOutput, createSecp256k1SigningSession, getPasskeyPrfOutput } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { Address } from "viem";

// Mera (Category Labs) passkey wallet: the EVM key is derived from the passkey's WebAuthn PRF
// output; nothing is stored server-side. We only need the address here (read-only screen).
const KEY = "kaskad.mera.credential";

function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  return node.privateKey;
}

export async function connectMera(): Promise<Address> {
  const rpId = location.hostname;
  let prf: Uint8Array;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {}
  if (stored) {
    prf = (await getPasskeyPrfOutput({ rpId, credential: JSON.parse(stored) })).prfOutput;
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
  const session = createSecp256k1SigningSession({ privateKey: key });
  key.fill(0);
  return toViemAccount(session).address;
}
