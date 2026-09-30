"use client";

import { useEffect, useState } from "react";
import { fetchBlockNumber } from "../block-number";
import { pollWhileVisible } from "../poll";
// Type only: the viem client stays out of the bundle unless a caller passes one.
import type { ChainReader } from "../reader";

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
 * is visible; paused when hidden, skipped while a read is in flight (`pollWhileVisible`). Never goes
 * backwards. By default it reads with a plain fetch (`fetchBlockNumber`, no viem), because the site
 * nav runs it on every page. Pass a stable `reader` (module level) to read through a viem client
 * instead, or a stable `read` function (tests).
 */
export function useLiveBlock(opts: { everyMs?: number; reader?: ChainReader; read?: () => Promise<bigint> } = {}): LiveBlock {
  const everyMs = opts.everyMs ?? LIVE_BLOCK_POLL_MS;
  const { reader, read } = opts;
  const [state, setState] = useState<LiveBlock>({ block: null, updatedAt: null, error: null });

  useEffect(() => {
    let live = true;
    const readBlock = read ?? (reader ? () => reader.getBlockNumber({ cacheTime: 0 }) : () => fetchBlockNumber());
    const stop = pollWhileVisible(async () => {
      try {
        const block = await readBlock();
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
  }, [everyMs, reader, read]);

  return state;
}
