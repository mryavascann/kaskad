"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/design/ui/skeleton";
import { cn } from "@/lib/utils";
import { useShouldReduceMotion } from "@/motion/hooks";
import { duration } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { withFormats, type Formatter } from "./format";

export type BlockPulseCopy = {
  label: string;
  block: string;
  rate: string;
  observed: string;
  since: string;
  loading: string;
  errorTitle: string;
};

export const BLOCK_PULSE_COPY: BlockPulseCopy = {
  label: "Monad blocks",
  block: "Block",
  rate: "{value} s per block",
  observed: "observed",
  since: "+{count} since the last read",
  loading: "Waiting for the first block",
  errorTitle: "Block feed interrupted",
};

type BlockPulseProps = {
  /** Latest block number (e.g. useLiveBlock().block); null until the first read. */
  block: bigint | null;
  /** Cells in the strip (one per block, a multiple of 10 keeps the major ticks still). */
  cells?: number;
  /** Shows the feed as interrupted; the last block stays on screen. */
  error?: ReactNode;
  locale?: string;
  formatInt?: Formatter;
  formatNum?: Formatter;
  copy?: Partial<BlockPulseCopy>;
  className?: string;
  id?: string;
};

/** Slowest and fastest per-block pace the strip replays (ms), and the biggest jump it replays cell by cell. */
const PACE = { min: duration.instant, max: duration.scene } as const;
const MAX_REPLAY = 60;

/**
 * A strip that ticks one cell per new block. Blocks that arrive together (between two polls) are
 * written one after another at the pace observed between those polls, so the strip beats at the
 * chain's real rate. Reduced motion: no ticking, the number and the count of new blocks only.
 */
export function BlockPulse({ block, cells = 40, error, locale, formatInt, formatNum, copy: copyProp, className, id }: BlockPulseProps) {
  const copy = mergeCopy(BLOCK_PULSE_COPY, copyProp);
  const f = withFormats(locale, { int: formatInt, num: formatNum });
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

  const current = block === null ? null : (shown ?? block);
  const head = current === null ? -1 : Number(current % BigInt(cells));
  const stale = Boolean(error);

  return (
    <figure
      id={id}
      data-slot="block-pulse"
      aria-label={copy.label}
      aria-busy={block === null || undefined}
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
    >
      <div aria-hidden className={cn("flex h-5 items-end justify-between", stale && "opacity-45")}>
        {Array.from({ length: cells }, (_, i) => {
          const age = head < 0 ? cells : (head - i + cells) % cells;
          const major = i % 10 === 0;
          return (
            <span
              key={i}
              data-head={age === 0 || undefined}
              className={cn(
                "w-px rounded-full",
                major ? "h-5" : "h-3",
                block === null
                  ? "bg-line-2"
                  : age === 0
                    ? "bg-monad-hi"
                    : "bg-fg-3 motion-safe:transition-opacity motion-safe:duration-(--dur-fast)",
              )}
              style={block === null || age === 0 ? undefined : { opacity: Math.max(0.12, 0.8 - (age / cells) * 0.8).toFixed(2) }}
            />
          );
        })}
      </div>
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption">
        <span className="label-mono text-fg-3">{copy.block}</span>
        {current === null ? (
          <>
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-[0.8em] w-[10ch] self-center" />
          </>
        ) : (
          <span className="font-mono text-fg-1">{f.int(Number(current))}</span>
        )}
        {pace && !stale && (
          <span className="font-mono text-fg-3">
            {fill(copy.since, { count: f.int(pace.count) })} · {fill(copy.rate, { value: f.num(pace.ms / 1000) })} ({copy.observed})
          </span>
        )}
        {stale && (
          <span className="text-liq-hi">
            {copy.errorTitle}
            {error !== true && <span className="text-fg-3"> · {error}</span>}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
