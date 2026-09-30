"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { getBurner } from "@/lib/kaskad/burner";
import { pollWhileVisible } from "../poll";
import { defaultReader } from "../reader";
import { BALANCE_POLL_MS, fetchSponsor, isSponsorLow, type SponsorStatus } from "../sponsor";

/**
 * Connect page data (app/(legacy)/baglan/Connect.tsx:69-88): burner address, balances of the burner
 * and of the connected browser / Mera wallets (up to 3 eth_getBalance, one batch), and the sponsor
 * budget from GET /api/fund. Every 10 s while visible. A failed balance read shows 0 (legacy).
 */
export function useSignerBalances(wallets: { injected?: Address | null; mera?: Address | null } = {}) {
  const injected = wallets.injected ?? null;
  const mera = wallets.mera ?? null;
  const [burner, setBurner] = useState<Address | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [sponsor, setSponsor] = useState<SponsorStatus | null>(null);

  const refresh = useCallback(async () => {
    const b = getBurner().address;
    setBurner(b);
    const reader = defaultReader();
    const addrs = [b, injected, mera].filter((a): a is Address => Boolean(a));
    fetchSponsor().then((s) => {
      if (s) setSponsor(s);
    });
    const vals = await Promise.all(addrs.map((a) => reader.getBalance({ address: a }).catch(() => 0n)));
    setBalances(Object.fromEntries(addrs.map((a, i) => [a, vals[i]])));
  }, [injected, mera]);

  useEffect(() => pollWhileVisible(refresh, BALANCE_POLL_MS), [refresh]);

  const balanceOf = (a: Address | null): bigint | null => (a ? (balances[a] ?? null) : null);
  return {
    burner,
    balances: { burner: balanceOf(burner), injected: balanceOf(injected), mera: balanceOf(mera) },
    sponsor,
    sponsorLow: isSponsorLow(sponsor?.spendableWei ?? null),
    refresh,
  };
}
