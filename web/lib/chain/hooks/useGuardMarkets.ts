"use client";

import { useCallback, useEffect, useState } from "react";
import { onIdle } from "../idle";
import { GUARD_POLL_MS, readMarkets, type MarketId } from "../guard";
import { pollWhileVisible } from "../poll";
import type { MarketState } from "../types";

/**
 * Both demo markets, refreshed every 6 s while the tab is visible (GuardPanel.tsx:102-117):
 * 6 calls in one JSON-RPC batch per tick; read errors keep the last state. `refresh()` re-reads now
 * (after a Guard run or a borrow). The first read waits for the browser's first idle period after
 * the first paint (the read client is viem, loaded with import()), so it does not land in hydration.
 */
export function useGuardMarkets() {
  const [markets, setMarkets] = useState<Record<MarketId, MarketState> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMarkets(await readMarkets());
    } catch {}
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const cancel = onIdle(() => {
      stop = pollWhileVisible(refresh, GUARD_POLL_MS);
    });
    return () => {
      cancel();
      stop?.();
    };
  }, [refresh]);

  return { a: markets?.a ?? null, b: markets?.b ?? null, refresh };
}
