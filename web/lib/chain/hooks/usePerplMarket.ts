"use client";

import { useCallback, useEffect, useState } from "react";
import type { PerplSymbol } from "@/lib/kaskad/perpl";
import { onIdle } from "../idle";
import type { PerpMarket } from "../perpl-model";
import { pollWhileVisible } from "../poll";

/** The panel re-reads the market this often while the tab is visible (the server caches 8 s). */
export const PERPL_POLL_MS = 10_000;

/**
 * One Perpl market from /api/perpl, re-read every 10 s while the tab is visible. Data and errors are
 * kept per symbol, so switching market never shows the previous one's. Read errors keep the last
 * state; `error` is set only while nothing was read for the current symbol.
 */
export function usePerplMarket(symbol: PerplSymbol) {
  const [market, setMarket] = useState<PerpMarket | null>(null);
  const [errorFor, setErrorFor] = useState<PerplSymbol | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/perpl?market=${symbol}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as PerpMarket;
      if (data.symbol !== symbol) return;
      setMarket(data);
      setReadAt(Date.now());
      setErrorFor(null);
    } catch {
      setErrorFor(symbol);
    }
  }, [symbol]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const cancel = onIdle(() => {
      stop = pollWhileVisible(refresh, PERPL_POLL_MS);
    });
    return () => {
      cancel();
      stop?.();
    };
  }, [refresh]);

  const current = market?.symbol === symbol ? market : null;
  return { market: current, error: errorFor === symbol && current === null, readAt: current ? readAt : null };
}
