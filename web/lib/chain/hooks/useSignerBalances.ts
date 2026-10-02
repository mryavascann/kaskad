"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { rememberBurnerAddress } from "../burner-peek";
import { onIdle } from "../idle";
import { pollWhileVisible } from "../poll";
import { DEV_SIGNERS } from "../signer-mode";
import { BALANCE_POLL_MS, fetchSponsor, isSponsorLow, type SponsorStatus } from "../sponsor";

/**
 * Connect page data (app/(legacy)/baglan/Connect.tsx:69-88): burner address, balances of the burner
 * and of the connected browser / Mera wallets (up to 3 eth_getBalance, one batch), and the sponsor
 * budget from GET /api/fund. Every 10 s while visible. A failed balance read shows 0 (legacy).
 * Starts once the browser is idle after the first paint: the burner (viem accounts) and the read
 * client are loaded with import() then, not with the page.
 */
export function useSignerBalances(wallets: { injected?: Address | null; mera?: Address | null } = {}) {
  const injected = wallets.injected ?? null;
  const mera = wallets.mera ?? null;
  const [burner, setBurner] = useState<Address | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [sponsor, setSponsor] = useState<SponsorStatus | null>(null);

  const refresh = useCallback(async () => {
    const { defaultReader } = await import("../reader");
    // Production never makes a burner key (signer-mode.ts): only development builds read one.
    let b: Address | null = null;
    if (DEV_SIGNERS) {
      const { getBurner } = await import("@/lib/kaskad/burner");
      b = getBurner().address;
      // So the next page load's signer strip can show it without loading the burner (burner-peek.ts).
      rememberBurnerAddress(b);
      setBurner(b);
    }
    const reader = defaultReader();
    const addrs = [b, injected, mera].filter((a): a is Address => Boolean(a));
    fetchSponsor().then((s) => {
      if (s) setSponsor(s);
    });
    const vals = await Promise.all(addrs.map((a) => reader.getBalance({ address: a }).catch(() => 0n)));
    setBalances(Object.fromEntries(addrs.map((a, i) => [a, vals[i]])));
  }, [injected, mera]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const cancel = onIdle(() => {
      stop = pollWhileVisible(refresh, BALANCE_POLL_MS);
    });
    return () => {
      cancel();
      stop?.();
    };
  }, [refresh]);

  const balanceOf = (a: Address | null): bigint | null => (a ? (balances[a] ?? null) : null);
  return {
    burner,
    balances: { burner: balanceOf(burner), injected: balanceOf(injected), mera: balanceOf(mera) },
    sponsor,
    sponsorLow: isSponsorLow(sponsor?.spendableWei ?? null),
    refresh,
  };
}
