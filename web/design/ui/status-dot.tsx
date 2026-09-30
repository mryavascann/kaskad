import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";
import styles from "./status-dot.module.css";
import type { Tone } from "./tone";

/** Dot color per tone (via currentColor, so the ring and the dot always match). */
const dotColor: Record<Tone, string> = {
  neutral: "text-fg-3",
  calm: "text-calm",
  warn: "text-warn",
  liq: "text-liq",
  safe: "text-safe",
  monad: "text-monad",
};

const dotSize = { sm: "size-1.5", md: "size-2", lg: "size-2.5" } as const;

type StatusDotProps = Omit<ComponentProps<"span">, "children"> & {
  tone?: Tone;
  size?: keyof typeof dotSize;
  /** Slow breathing (live data). Still under reduced motion. */
  pulse?: boolean;
  /** Expanding sonar ring (an event just happened). Hidden under reduced motion. */
  ping?: boolean;
  /**
   * Accessible name. Without it the dot is decorative (hidden from assistive tech), which is right
   * whenever a visible word next to it states the status.
   */
  label?: string;
};

/** Small status mark. Color is never the only signal: give it a `label` or put a word next to it. */
export function StatusDot({ tone = "neutral", size = "md", pulse = false, ping = false, label, className, ...props }: StatusDotProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-tone={tone}
      className={cn("relative inline-flex shrink-0 rounded-full", dotSize[size], dotColor[tone], className)}
      {...props}
    >
      {ping && <span data-slot="ping" className={cn("absolute inset-0 rounded-full border border-current", styles.ping)} />}
      <span data-slot="dot" className={cn("relative size-full rounded-full bg-current", pulse && "motion-safe:animate-live")} />
    </span>
  );
}

const grouping = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type LiveIndicatorProps = Omit<ComponentProps<"span">, "children"> & {
  /** What is live, e.g. "Monad testnet". Also the status word: say "Reconnecting" or "RPC unreachable" when it is not live. */
  label: ReactNode;
  /** A counter such as the latest block. `null` = loading (skeleton); leave it out to show the label only. */
  value?: number | null;
  /** Word before the value. */
  valueLabel?: ReactNode;
  tone?: Tone;
  /** Breathing dot. On by default. */
  pulse?: boolean;
  /** Screen-reader text while `value` is null. */
  loadingLabel?: string;
};

/**
 * `● MONAD TESTNET · BLOCK 65,813,636`. Not a live region on purpose: a block counter that announced
 * every update would drown out everything else.
 */
export function LiveIndicator({
  label,
  value,
  valueLabel = "Block",
  tone = "safe",
  pulse = true,
  loadingLabel = "Loading",
  className,
  ...props
}: LiveIndicatorProps) {
  return (
    <span
      data-slot="live-indicator"
      className={cn("label-mono inline-flex max-w-full min-w-0 items-center gap-2 text-fg-3", className)}
      {...props}
    >
      <StatusDot tone={tone} pulse={pulse} />
      <span className="min-w-0 truncate text-fg-2">{label}</span>
      {value !== undefined && (
        <>
          <span aria-hidden className="shrink-0 text-fg-4">
            ·
          </span>
          <span className="inline-flex shrink-0 items-center gap-[0.6em] whitespace-nowrap" aria-busy={value === null || undefined}>
            <span>{valueLabel}</span>
            {value === null ? (
              <>
                <span className="sr-only">{loadingLabel}</span>
                <Skeleton className="h-[0.8em] w-[9ch]" />
              </>
            ) : (
              <span className="tabular-nums text-fg-2">{grouping.format(value)}</span>
            )}
          </span>
        </>
      )}
    </span>
  );
}
