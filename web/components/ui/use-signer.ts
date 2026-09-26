"use client";

import { useSyncExternalStore } from "react";
import { signerStore } from "@/lib/kaskad/signer";

// React requires a stable SSR snapshot; the signer store and signing flows stay unchanged.
const serverSnapshot = signerStore.server();
const getServerSnapshot = () => serverSnapshot;

export function useSigner() {
  return useSyncExternalStore(signerStore.subscribe, signerStore.get, getServerSnapshot);
}
