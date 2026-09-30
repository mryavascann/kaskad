import type { CSSProperties, ReactNode } from "react";
import type { Classification } from "@/lib/chain/book";
import { Skeleton } from "@/design/ui/skeleton";
import { cn } from "@/lib/utils";
import { stagger } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { DataTable } from "./data-table";
import { withFormats, type Formatter, type VizFormats } from "./format";
import { StateBox, chartStatus, type StateCopy } from "./frame";
import { STATE_COPY, STATE_FILL, StateLegend, stateLabel, type StateCopyKeys } from "./outcome";
import { atEnd, byThreshold, flipRanks, stateCounts, tileState, visibleStates, type Replay, type TileState, type VizPosition } from "./positions";
import styles from "./viz.module.css";

export type PositionsCopy = StateCopy &
  StateCopyKeys & {
    label: string;
    summaryEnd: string;
    summaryStep: string;
    orderNote: string;
    weightNote: string;
    mismatchTitle: string;
    mismatchBody: string;
    tableSummary: string;
    tableCaption: string;
    colPosition: string;
    colOutcome: string;
    colDebt: string;
    colHf: string;
    colDrop: string;
    colFirst: string;
    colFinalHf: string;
    already: string;
    never: string;
    noDebt: string;
    none: string;
  };

export const POSITIONS_COPY: PositionsCopy = {
  ...STATE_COPY,
  label: "Positions",
  summaryEnd:
    "{total} positions at the end of the run: {badDebt} with bad debt, {stuck} stuck below the liquidation threshold, {liquidated} liquidated, {safe} safe.",
  summaryStep:
    "{total} positions at block {block} of {steps}: {liquidated} liquidated, {below} below the liquidation threshold, {pending} not hit yet.",
  orderNote: "Closest to liquidation first.",
  weightNote: "Width is proportional to debt.",
  mismatchTitle: "Per-position view unavailable",
  mismatchBody: "The off-chain replay does not match the on-chain preview exactly, so positions are not attributed.",
  tableSummary: "Positions table",
  tableCaption: "Every position, closest to liquidation first: outcome, debt, health factor and liquidation threshold",
  colPosition: "Position",
  colOutcome: "Outcome",
  colDebt: "Debt",
  colHf: "Health factor",
  colDrop: "Liquidatable after",
  colFirst: "First liquidation",
  colFinalHf: "Final HF",
  already: "Already",
  never: "Never",
  noDebt: "No debt",
  none: "–",
  loading: "Loading positions",
  emptyTitle: "No positions",
  emptyBody: "The book has no positions for this run.",
  errorTitle: "Couldn't load the positions",
};

/** `classifyPositions()` output, or any list of positions with the fields the tiles read. */
export type PositionsInput = Classification | { consistent: true; positions: readonly VizPosition[] };

export type PositionsFormatProps = {
  locale?: string;
  formatUsd?: Formatter;
  formatPct?: Formatter;
  formatHf?: Formatter;
  formatInt?: Formatter;
};

type PositionTilesProps = Replay &
  PositionsFormatProps & {
    classification: PositionsInput | null;
    /** `count`: one equal tile per position. `debt`: one strip, each tile as wide as its debt. */
    weight?: "count" | "debt";
    /** Tiles the skeleton draws while loading (e.g. scenario.maxPositions), so nothing moves when they land. */
    expectedCount?: number;
    table?: boolean;
    error?: ReactNode;
    errorAction?: ReactNode;
    copy?: Partial<PositionsCopy>;
    className?: string;
    id?: string;
  };

const TILE = "size-5 sm:size-6";

/**
 * One tile per position, closest to liquidation first. States follow the replay's `step`: a tile
 * flips to "below threshold" when the block's oracle price drops under its liquidation price, to
 * "liquidated" at its first liquidation, and to its final outcome at the end. Every state has its own
 * pattern and legend icon. Screen readers get one summary sentence and the positions table, not one
 * stop per tile. No client JavaScript: flips are CSS, keyed on the state.
 */
export function PositionTiles({
  classification,
  step,
  steps,
  prices,
  weight = "count",
  expectedCount,
  table = true,
  error,
  errorAction,
  locale,
  formatUsd,
  formatPct,
  formatHf,
  formatInt,
  copy: copyProp,
  className,
  id,
}: PositionTilesProps) {
  const copy = mergeCopy(POSITIONS_COPY, copyProp);
  const f = withFormats(locale, { usd: formatUsd, pct: formatPct, hf: formatHf, int: formatInt });
  const mismatch = classification && !classification.consistent;
  const positions = classification?.consistent ? classification.positions : [];
  const status = mismatch ? "error" : chartStatus(classification, error, positions.length === 0);

  if (status !== "ready") {
    const box = weight === "debt" ? "h-12" : expectedCount ? undefined : "h-16";
    return (
      <figure id={id} data-slot="position-tiles" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
        {status === "loading" && expectedCount && weight === "count" ? (
          <div aria-busy="true" className="flex flex-wrap gap-1">
            <span className="sr-only">{copy.loading}</span>
            {Array.from({ length: expectedCount }, (_, i) => (
              <Skeleton key={i} className={cn(TILE, "rounded-[3px]")} />
            ))}
          </div>
        ) : (
          <StateBox
            status={status}
            className={box}
            copy={mismatch ? { ...copy, errorTitle: copy.mismatchTitle } : copy}
            error={mismatch ? copy.mismatchBody : error}
            errorAction={errorAction}
          />
        )}
        <div aria-hidden className="min-h-[1lh] text-caption" />
      </figure>
    );
  }

  const replay: Replay = { step, steps, prices };
  const ordered = byThreshold(positions);
  const states = ordered.map((p) => tileState(p, replay));
  const delays = flipRanks(ordered, states, replay).map((rank) => rank * stagger.tight);
  const counts = stateCounts(positions, replay);
  const end = atEnd(replay);
  const total = f.int(positions.length);
  const summary = end
    ? fill(copy.summaryEnd, {
        total,
        badDebt: f.int(counts["bad-debt"]),
        stuck: f.int(counts.stuck),
        liquidated: f.int(counts.liquidated),
        safe: f.int(counts.safe),
      })
    : fill(copy.summaryStep, {
        total,
        block: f.int(step ?? 0),
        steps: f.int(steps ?? 0),
        liquidated: f.int(counts.liquidated),
        below: f.int(counts.below),
        pending: f.int(counts.pending),
      });
  const legend = visibleStates(replay, Boolean(prices?.length)).map((state) => ({
    state,
    label: stateLabel(copy, state),
    count: f.int(counts[state]),
  }));

  return (
    <figure id={id} data-slot="position-tiles" data-weight={weight} aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div role="img" aria-label={summary} className={weight === "debt" ? "flex h-12 w-full gap-px" : "flex flex-wrap gap-1"}>
        {ordered.map((p, i) => (
          <span
            key={p.index}
            data-state={states[i]}
            className={cn("relative block", weight === "debt" ? "h-full min-w-[3px]" : TILE)}
            style={weight === "debt" ? { flexGrow: Math.max(0, Math.round(p.debtUsd)), flexBasis: 0 } : undefined}
          >
            <Face state={states[i]} delay={delays[i]} />
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <StateLegend items={legend} />
        <p className="text-caption text-fg-3">
          {copy.orderNote}
          {weight === "debt" && ` ${copy.weightNote}`}
        </p>
      </div>
      {table && <PositionsTable positions={ordered} copy={copy} f={f} />}
    </figure>
  );
}

/** The visible face of a tile. Keyed on the state: a new state remounts it and it tips in. */
function Face({ state, delay }: { state: TileState; delay: number }) {
  return (
    <span
      key={state}
      className={cn("absolute inset-0 rounded-[3px] border", STATE_FILL[state], styles.flip)}
      style={{ "--flip-delay": `${delay}ms` } as CSSProperties}
    />
  );
}

/** The positions as a table (shared by PositionTiles and PositionRings). */
export function PositionsTable({ positions, copy, f }: { positions: readonly VizPosition[]; copy: PositionsCopy; f: VizFormats }) {
  const hf = (v: number | null) => (v === null || !Number.isFinite(v) ? copy.noDebt : f.hf(v));
  const drop = (d: number | null) => (d === null ? copy.never : d <= 0 ? copy.already : f.pct(d));
  return (
    <DataTable
      summary={copy.tableSummary}
      caption={copy.tableCaption}
      rows={positions}
      rowKey={(p) => p.index}
      columns={[
        { label: copy.colPosition, numeric: true, cell: (p) => `#${p.index}` },
        { label: copy.colOutcome, cell: (p) => stateLabel(copy, p.outcome) },
        { label: copy.colDebt, numeric: true, cell: (p) => f.usd(p.debtUsd) },
        { label: copy.colHf, numeric: true, cell: (p) => hf(p.healthFactor) },
        { label: copy.colDrop, numeric: true, cell: (p) => drop(p.thresholdDrop) },
        { label: copy.colFirst, numeric: true, cell: (p) => (p.firstLiquidationStep === null ? copy.none : f.int(p.firstLiquidationStep)) },
        { label: copy.colFinalHf, numeric: true, cell: (p) => hf(p.finalHealthFactor) },
      ]}
    />
  );
}
