// What the signer strip can show about the temporary wallet (burner) without loading it. The burner
// module (lib/kaskad/burner.ts) pulls viem and secp256k1: about 1 s of main-thread work on a mid-range
// phone, too much for a strip that fills by itself after the first paint. This module reads only
// localStorage. No viem; isomorphic (returns "none" on the server).

import type { Address } from "viem";
import { isAddressLoose } from "./units";

/** The burner's private key slot (lib/kaskad/burner.ts:10, read only here). */
export const BURNER_KEY = "kaskad.burner.v1";
/** The burner's address, remembered once the burner module has derived it. */
export const BURNER_ADDRESS_KEY = "kaskad.burner.address.v1";

/** Same key check as getBurner() (lib/kaskad/burner.ts:26). */
const VALID_KEY = /^0x[0-9a-fA-F]{64}$/;

export type BurnerPeek =
  /** No key yet: the burner is created when the signer module first loads (a key would be generated then). */
  | { kind: "none" }
  /** A key and its remembered address. */
  | { kind: "known"; address: Address }
  /** A key without a remembered address (or storage unreadable): only the burner module can derive it. */
  | { kind: "unknown" };

type KeyValue = Pick<Storage, "getItem" | "setItem">;

const storage = (): KeyValue | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** FNV-1a (32 bit) of the key, so a remembered address is only used with the key it belongs to. */
function tag(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function peekBurner(store: KeyValue | null = storage()): BurnerPeek {
  if (!store) return { kind: "unknown" };
  try {
    const key = store.getItem(BURNER_KEY);
    if (!key || !VALID_KEY.test(key)) return { kind: "none" };
    const saved = JSON.parse(store.getItem(BURNER_ADDRESS_KEY) ?? "null") as { tag?: unknown; address?: unknown } | null;
    if (saved && saved.tag === tag(key) && typeof saved.address === "string" && isAddressLoose(saved.address)) {
      return { kind: "known", address: saved.address as Address };
    }
    return { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

/** Remembers `address` for the key now in storage (call it with the address getBurner() derived). */
export function rememberBurnerAddress(address: Address, store: KeyValue | null = storage()): void {
  if (!store) return;
  try {
    const key = store.getItem(BURNER_KEY);
    if (!key || !VALID_KEY.test(key)) return;
    store.setItem(BURNER_ADDRESS_KEY, JSON.stringify({ tag: tag(key), address }));
  } catch {}
}
