"use client";

import { useEffect, useState } from "react";
import type { PerplWallet } from "../perpl-wallet-risk";
import { pollWhileVisible } from "../poll";

type State = { address: string; data: PerplWallet | null; error: boolean };

export function usePerplWallet(address: string | null) {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    if (!address) return;
    let active = true;
    const controller = new AbortController();
    const stop = pollWhileVisible(async () => {
      try {
        const res = await fetch(`/api/perpl/wallet?address=${encodeURIComponent(address)}`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json() as PerplWallet;
        if (data.address.toLowerCase() !== address.toLowerCase()) throw new Error("Wrong account response");
        if (active) setState({ address, data, error: false });
      } catch {
        if (active) setState((old) => ({ address, data: old?.address === address ? old.data : null, error: true }));
      }
    }, 10_000);
    return () => { active = false; controller.abort(); stop(); };
  }, [address]);
  const current = state?.address === address ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? false, loading: !!address && !current };
}
