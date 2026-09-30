"use client";

import { useEffect, useSyncExternalStore } from "react";
import { lazySignerStore, loadSignerWhenIdle } from "../signer";

export type { SignerKind } from "../signer";

// React needs a stable SSR snapshot (components/ui/use-signer.ts:6-8); the store stays unchanged.
const serverSnapshot = lazySignerStore.server();
const getServerSnapshot = () => serverSnapshot;

/**
 * Active signer `{ kind, address }` (components/ui/use-signer.ts:10-12). Page reload resets to the
 * burner. lib/kaskad/signer.ts is loaded lazily (lib/chain/signer.ts): until then this returns
 * `{ kind: "burner", address: null }`, which is exact for `kind` (only that module can switch the
 * signer). `{ load: "idle" }` also loads it once the browser is idle, for views that show the address.
 */
export function useSigner(opts: { load?: "idle" | "never" } = {}) {
  const load = opts.load ?? "never";
  useEffect(() => (load === "idle" ? loadSignerWhenIdle() : undefined), [load]);
  return useSyncExternalStore(lazySignerStore.subscribe, lazySignerStore.get, getServerSnapshot);
}
