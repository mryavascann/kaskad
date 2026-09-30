"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";
import { loadSigner, type SignerModule } from "../signer";
import { connectError, type ConnectError } from "../status";

/**
 * Signer switching for the connect page (app/(legacy)/baglan/Connect.tsx:90-100): busy flag, typed
 * error, and the addresses of the wallets connected in this session. The signer itself lives in
 * lib/kaskad/signer.ts (read it with useSigner()), loaded on the first switch (lib/chain/signer.ts).
 */
export function useSignerConnect() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ConnectError | null>(null);
  const [injected, setInjected] = useState<Address | null>(null);
  const [mera, setMera] = useState<Address | null>(null);

  const run = useCallback(async (fn: (signer: SignerModule) => Promise<Address>, set: (a: Address) => void) => {
    setBusy(true);
    setError(null);
    try {
      set(await fn(await loadSigner()));
    } catch (e) {
      setError(connectError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    busy,
    error,
    injected,
    mera,
    /** eth_requestAccounts + switch / add Monad testnet, then sign with the browser wallet. */
    connectInjected: useCallback(() => run((m) => m.connectInjected(), setInjected), [run]),
    /** WebAuthn passkey prompt; the key lives only in memory. */
    connectMera: useCallback((mode: "login" | "create") => run((m) => m.connectMeraSigner(mode), setMera), [run]),
    /** Back to the sponsored in-browser burner. */
    selectBurner: useCallback(() => {
      void loadSigner().then((m) => m.selectBurner(), () => {});
    }, []),
  };
}
