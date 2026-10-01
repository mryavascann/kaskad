"use client";

import { useEffect, useRef, useState } from "react";
import { useShouldReduceMotion } from "@/motion/hooks";
import { duration } from "@/motion/tokens";
import { BlockPulseView, type BlockPulseProps } from "./block-pulse-view";

export { BLOCK_PULSE_COPY, BlockPulseStatic, type BlockPulseCopy, type BlockPulseProps } from "./block-pulse-view";

/** Slowest and fastest per-block pace the strip replays (ms), and the biggest jump it replays cell by cell. */
const PACE = { min: duration.instant, max: duration.scene } as const;
const MAX_REPLAY = 60;

/**
 * A strip that ticks one cell per new block. Blocks that arrive together (between two polls) are
 * written one after another at the pace observed between those polls, so the strip beats at the
 * chain's real rate. Reduced motion: no ticking, the number and the count of new blocks only.
 * Markup: `BlockPulseView` (./block-pulse-view.tsx, shared with the server-only `BlockPulseStatic`).
 */
export function BlockPulse(props: BlockPulseProps) {
  const { block } = props;
  const reduce = useShouldReduceMotion();
  // `shown` trails `block` while new blocks are being written; null means "caught up".
  const [shown, setShown] = useState<bigint | null>(null);
  const [pace, setPace] = useState<{ ms: number; count: number } | null>(null);
  const last = useRef<{ block: bigint; at: number } | null>(null);

  useEffect(() => {
    if (block === null) return;
    const now = performance.now();
    const prev = last.current;
    last.current = { block, at: now };
    if (!prev || block <= prev.block) return;
    const count = Number(block - prev.block);
    const ms = Math.min(PACE.max, Math.max(PACE.min, (now - prev.at) / count));
    let cursor = prev.block;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPace({ ms, count }), 0));
    if (reduce || count > MAX_REPLAY) return () => timers.forEach(clearTimeout);
    // Replay the new blocks one by one from where the strip is.
    timers.push(setTimeout(() => setShown(prev.block), 0));
    const id = setInterval(() => {
      cursor += 1n;
      setShown(cursor >= block ? null : cursor);
      if (cursor >= block) clearInterval(id);
    }, ms);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(id);
    };
  }, [block, reduce]);

  return <BlockPulseView {...props} state={{ shown, pace }} />;
}
