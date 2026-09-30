"use client";

import { useEffect, useState } from "react";
import { pollWhileVisible } from "../poll";
import { defaultReader, type ChainReader } from "../reader";

/** Live block poll period. Monad blocks are ~0.4 s; the UI only needs a heartbeat. */
export const LIVE_BLOCK_POLL_MS = 3_000;

export type LiveBlock = {
  block: bigint | null;
  /** Local time of the last successful read (ms since epoch). */
  updatedAt: number | null;
  error: { code: "failed" | "rate-limited"; raw: string } | null;
};

/**
 * Latest Monad testnet block number (eth_blockNumber, allowed by /api/rpc), every ~3 s while the tab
 * is visible; paused when hidden. Never goes backwards. Pass a stable `reader` (module level) or none.
 */
export function useLiveBlock(opts: { everyMs?: number; reader?: ChainReader } = {}): LiveBlock {
  const everyMs = opts.everyMs ?? LIVE_BLOCK_POLL_MS;
  const reader = opts.reader;
  const [state, setState] = useState<LiveBlock>({ block: null, updatedAt: null, error: null });

  useEffect(() => {
    let live = true;
    const stop = pollWhileVisible(async () => {
      try {
        const block = await (reader ?? defaultReader()).getBlockNumber({ cacheTime: 0 });
        if (live) setState((prev) => (prev.block !== null && block < prev.block ? prev : { block, updatedAt: Date.now(), error: null }));
      } catch (e) {
        const raw = String((e as Error)?.message ?? e);
        if (live) setState((prev) => ({ ...prev, error: { code: /Status: 429|çok fazla istek/.test(raw) ? "rate-limited" : "failed", raw } }));
      }
    }, everyMs);
    return () => {
      live = false;
      stop();
    };
  }, [everyMs, reader]);

  return state;
}
