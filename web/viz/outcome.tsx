import { ArrowDownToLine, Circle, Hourglass, OctagonAlert, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import { toneText, type Tone } from "@/design/ui/tone";
import { cn } from "@/lib/utils";
import type { TileState } from "./positions";
import styles from "./viz.module.css";

/**
 * How each position state looks. Color never works alone: every state has its own pattern (solid,
 * hatch, cross-hatch, outline, level mark) and its own icon in the legend.
 */
export const STATE_ICON: Record<TileState, LucideIcon> = {
  "bad-debt": OctagonAlert,
  stuck: Hourglass,
  liquidated: Zap,
  below: ArrowDownToLine,
  pending: Circle,
  safe: ShieldCheck,
};

export const STATE_TONE: Record<TileState, Tone> = {
  "bad-debt": "liq",
  stuck: "warn",
  liquidated: "liq",
  below: "warn",
  pending: "neutral",
  safe: "calm",
};

/** Border + fill classes of a tile or a legend swatch. */
export const STATE_FILL: Record<TileState, string> = {
  "bad-debt": cn("border-liq bg-liq/25", styles.cross),
  stuck: cn("border-warn bg-warn/10", styles.hatch),
  liquidated: "border-sev-3 bg-sev-3",
  below: cn("border-warn bg-transparent", styles.below),
  pending: "border-line-3 bg-transparent",
  safe: "border-calm/70 bg-calm/12",
};

/** Default English names of the states (every chart takes them as copy). */
export const STATE_COPY = {
  stateBadDebt: "Bad debt",
  stateStuck: "Stuck",
  stateLiquidated: "Liquidated",
  stateBelow: "Below threshold",
  statePending: "Not hit yet",
  stateSafe: "Safe",
};

export type StateCopyKeys = typeof STATE_COPY;

const KEY: Record<TileState, keyof StateCopyKeys> = {
  "bad-debt": "stateBadDebt",
  stuck: "stateStuck",
  liquidated: "stateLiquidated",
  below: "stateBelow",
  pending: "statePending",
  safe: "stateSafe",
};

export const stateLabel = (copy: StateCopyKeys, state: TileState) => copy[KEY[state]];

/** Legend swatch: the tile's pattern in a small square. */
export function StateSwatch({ state, className }: { state: TileState; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-3 shrink-0 rounded-[2px] border", STATE_FILL[state], className)} />;
}

type LegendItem = { state: TileState; label: string; count: string };

/** Swatch, icon, name and count per state. Plain text, so it also reads well without the chart. */
export function StateLegend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-5 gap-y-2", className)}>
      {items.map(({ state, label, count }) => {
        const Icon = STATE_ICON[state];
        return (
          <li key={state} data-state={state} className="flex items-center gap-2 text-caption text-fg-2">
            <StateSwatch state={state} />
            <Icon aria-hidden className={cn("size-3.5 shrink-0", toneText[STATE_TONE[state]])} />
            <span>{label}</span>
            <span className="font-mono text-fg-1">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
