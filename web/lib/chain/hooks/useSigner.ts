"use client";

import { useSyncExternalStore } from "react";
import { signerStore } from "@/lib/kaskad/signer";

export type { SignerKind } from "@/lib/kaskad/signer";

// React needs a stable SSR snapshot (components/ui/use-signer.ts:6-8); the store stays unchanged.
const serverSnapshot = signerStore.server();
const getServerSnapshot = () => serverSnapshot;

/** Active signer `{ kind, address }` (components/ui/use-signer.ts:10-12). Page reload resets to the burner. */
export function useSigner() {
  return useSyncExternalStore(signerStore.subscribe, signerStore.get, getServerSnapshot);
}
