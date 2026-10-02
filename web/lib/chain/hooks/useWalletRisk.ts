"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onIdle } from "../idle";
import type { Result } from "../types";
import {
  HEADLINE_CASCADE,
  SURVIVE_SHOCK_PCT,
  cascadeFor,
  fetchPosition,
  surviveSuggestions,
  walletRisk,
  type PositionLookup,
  type UserPosition,
} from "../wallet";
import { readInjectedAddress, readMeraAddress, type AddressLookup } from "../wallet-client";
import { signerIfLoaded } from "../signer";
import { isAddressLoose } from "../units";

type LookupState = {
  address: string;
  position: UserPosition | null;
  cascade: Result | null;
  error: Extract<PositionLookup, { ok: false }>["error"] | null;
  loading: boolean;
};

const EMPTY: LookupState = { address: "", position: null, cascade: null, error: null, loading: false };

/**
 * Wallet risk page state (app/(legacy)/cuzdan/Wallet.tsx:34-96): the syrupUSDC -20 % headline cascade
 * on mount, address lookup (GET /api/position, then the -3 % cascade of the dominant collateral),
 * derived risk and survive suggestions. Only the newest lookup may update the state. The headline
 * cascade (viem read client, loaded with import()) starts once the browser is idle after the first
 * paint; the page's first screen is the server-rendered search panel.
 */
export function useWalletRisk() {
  const [headline, setHeadline] = useState<Result | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>(EMPTY);
  const [shockPct, setShockPct] = useState<number>(SURVIVE_SHOCK_PCT.default);
  const [identity, setIdentity] = useState<AddressLookup | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    const cancel = onIdle(() => {
      void cascadeFor(HEADLINE_CASCADE.assetId, HEADLINE_CASCADE.shockBps).then((r) => {
        if (live) setHeadline(r);
      });
    });
    return () => {
      live = false;
      cancel();
    };
  }, []);

  const lookup = useCallback(async (address: string) => {
    const id = ++seq.current;
    if (!isAddressLoose(address)) {
      // legacy keeps the previous result on screen and only shows the error (Wallet.tsx:50)
      setLookupState((s) => ({ ...s, address, error: { code: "invalid-address" }, loading: false }));
      return;
    }
    setLookupState({ ...EMPTY, address, loading: true });
    const res = await fetchPosition(address);
    if (id !== seq.current) return;
    if (!res.ok) {
      setLookupState({ ...EMPTY, address, error: res.error });
      return;
    }
    setLookupState({ ...EMPTY, address, position: res.position });
    const dominant = res.position.dominant;
    if (dominant) {
      const cascade = await cascadeFor(dominant.id);
      if (id === seq.current) setLookupState((s) => ({ ...s, cascade }));
    }
  }, []);

  /**
   * Mera passkey or browser wallet address -> lookup (read only, signer unchanged). A passkey already
   * signed in (signer strip, PasskeyGate) is used as is: no second passkey prompt.
   */
  const lookupWith = useCallback(
    async (source: "mera" | "injected") => {
      const signed = source === "mera" ? signerIfLoaded()?.signerStore.get() : null;
      const res: AddressLookup =
        signed?.kind === "mera" && signed.address
          ? { ok: true, address: signed.address }
          : source === "mera"
            ? await readMeraAddress()
            : await readInjectedAddress();
      setIdentity(res);
      if (res.ok) await lookup(res.address);
    },
    [lookup],
  );

  const { position, cascade } = lookupState;
  return {
    ...lookupState,
    headline,
    risk: position ? walletRisk(position, cascade, headline) : null,
    survive: position ? surviveSuggestions(position, shockPct) : null,
    shockPct,
    setShockPct,
    /** Result of the last Mera / browser wallet address request. */
    identity,
    lookup,
    lookupWith,
  };
}
