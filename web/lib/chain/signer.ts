"use client";

// Lazy handle on the chain layer's signer (lib/kaskad/signer.ts). That module pulls the burner
// (viem accounts, secp256k1) and, through it, the Mera SDK path, so it is loaded with a dynamic
// import() only when needed: an action that sends (runTx, borrow), a signer switch, or the signer
// strip's idle load for its address and balances. Until then the state is the server snapshot
// `{ kind: DEFAULT_SIGNER, address: null }`, which is also the only state the store can be in before
// the module ran (a page load always starts there: Mera not signed in yet, or the burner in
// development builds; only the module can switch it).

import type { Address } from "viem";
import type { SignerKind } from "@/lib/kaskad/signer";
import { onIdle } from "./idle";
import { DEFAULT_SIGNER } from "./signer-mode";

export type { SignerKind };
export type SignerModule = typeof import("@/lib/kaskad/signer");
export type SignerState = { kind: SignerKind; address: Address | null };

/** Snapshot before the module loaded, and on the server (components/ui/use-signer.ts:6-8). */
export const SIGNER_SERVER_SNAPSHOT: SignerState = Object.freeze({ kind: DEFAULT_SIGNER, address: null }) as SignerState;

let loaded: SignerModule | null = null;
let loading: Promise<SignerModule> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Loads lib/kaskad/signer once (later calls share the same promise) and wires its store to ours. */
export function loadSigner(): Promise<SignerModule> {
  loading ??= import("@/lib/kaskad/signer").then(
    (mod) => {
      loaded = mod;
      mod.signerStore.subscribe(notify);
      notify();
      return mod;
    },
    (e) => {
      loading = null; // a failed chunk load may be retried
      throw e;
    },
  );
  return loading;
}

/** The module if it already loaded (no side effect). */
export const signerIfLoaded = (): SignerModule | null => loaded;

/** Store with the same shape as `signerStore`, readable before the module loads. */
export const lazySignerStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get(): SignerState {
    return loaded ? loaded.signerStore.get() : SIGNER_SERVER_SNAPSHOT;
  },
  server(): SignerState {
    return SIGNER_SERVER_SNAPSHOT;
  },
};

/** Loads the signer once the browser is idle after the first paint. Returns a cancel function. */
export function loadSignerWhenIdle(): () => void {
  if (loaded) return () => {};
  return onIdle(() => void loadSigner().catch(() => {}));
}
