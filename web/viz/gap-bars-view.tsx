/**
 * GapBars' markup, server-safe (no hooks, no client code): the live `GapBars` (./gap-bars.tsx) renders
 * it with refs for its entrance, and `GapBarsStatic` renders the complete chart as plain server HTML
 * (e.g. under a takeover island, until the live chart's chunk loads). Same markup in both.
 */
import type { ReactNode, Ref } from "react";
import { Skeleton, SkeletonMetric } from "@/design/ui/skeleton";
import { cn } from "@/lib/utils";
import { fill, mergeCopy } from "./copy";
import { withFormats, type Formatter } from "./format";
import { StateBox, chartStatus, type StateCopy } from "./frame";
import { pct } from "./geometry";
import styles from "./viz.module.css";

export type GapBarsCopy = StateCopy & {
  label: string;
  scaleTag: string;
  cleared: string;
  stuck: string;
  ratioLabel: string;
  /** Figure caption (also what screen readers hear first). */
  caption: string;
  captionNoClear: string;
  hairline: string;
};

export const GAP_BARS_COPY: GapBarsCopy = {
  label: "Liquidity gap",
  scaleTag: "Same scale",
  cleared: "What the pool lets a liquidator clear",
  stuck: "Debt that can't be liquidated instantly",
  ratioLabel: "Liquidity gap",
  caption: "{stuck} can't be liquidated instantly: {ratio} the {cleared} the pool lets a liquidator clear.",
  captionNoClear: "{stuck} can't be liquidated instantly, and an instant sale into the pool clears nothing.",
  hairline: "Drawn to scale: the cleared bar is {share} of the other one.",
  loading: "Loading the liquidity gap",
  emptyTitle: "Nothing to compare",
  emptyBody: "No debt was stuck and nothing was liquidated in this run.",
  errorTitle: "Couldn't load the liquidity gap",
};

export type GapBarsProps = {
  /** Debt the pool lets a liquidator clear by an instant sale (Result.totalLiquidated, USD). */
  cleared: number | null;
  /** Debt that can't be liquidated instantly (Result.stuckDebt, USD). */
  stuck: number | null;
  /** Model footnote under the bars (e.g. <Footnote>…</Footnote>). */
  footnote?: ReactNode;
  error?: ReactNode;
  errorAction?: ReactNode;
  locale?: string;
  formatUsd?: Formatter;
  formatRatio?: Formatter;
  formatPct?: Formatter;
  copy?: Partial<GapBarsCopy>;
  className?: string;
  id?: string;
};

/**
 * Two bars on the same linear scale: what the pool lets a liquidator clear against the debt that
 * can't be liquidated instantly. The small one is a hairline (never thinner than 1px); the ratio is
 * computed from the two inputs. The markup of every state; `refs` let the live chart animate it.
 */
export function GapBarsView({
  cleared,
  stuck,
  footnote,
  error,
  errorAction,
  locale,
  formatUsd,
  formatRatio,
  formatPct,
  copy: copyProp,
  className,
  id,
  refs,
}: GapBarsProps & { refs?: GapBarsRefs }) {
  const copy = mergeCopy(GAP_BARS_COPY, copyProp);
  const f = withFormats(locale, { usd: formatUsd, ratio: formatRatio, pct: formatPct });
  const ready = cleared !== null && stuck !== null;
  const status = chartStatus(ready ? { cleared, stuck } : null, error, ready && cleared <= 0 && stuck <= 0);

  const { root: rootRef, cleared: clearedRef, stuck: stuckRef, ratio: ratioRef } = refs ?? {};

  if (status === "error" || status === "empty") {
    return (
      <figure ref={rootRef} id={id} data-slot="gap-bars" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
        <StateBox status={status} className="min-h-40" copy={copy} error={error} errorAction={errorAction} />
      </figure>
    );
  }

  const loading = status === "loading" || !ready;
  const max = ready ? Math.max(cleared, stuck, 0) : 0;
  const share = (v: number) => (max > 0 ? Math.max(0, v) / max : 0);
  const ratio = ready && cleared > 0 ? stuck / cleared : null;
  const caption = !ready
    ? copy.loading
    : ratio !== null
      ? fill(copy.caption, { stuck: f.usd(stuck), ratio: f.ratio(ratio), cleared: f.usd(cleared) })
      : fill(copy.captionNoClear, { stuck: f.usd(stuck) });

  return (
    <figure
      ref={rootRef}
      id={id}
      data-slot="gap-bars"
      aria-label={copy.label}
      aria-busy={loading || undefined}
      className={cn("flex min-w-0 flex-col gap-5", className)}
    >
      <p className="label-mono text-fg-3">{copy.scaleTag}</p>
      <Row
        value={ready ? f.usd(cleared) : null}
        label={copy.cleared}
        barRef={clearedRef}
        width={ready ? share(cleared) : 0}
        barClass="bg-fg-1"
        loading={loading}
      />
      <Row
        value={ready ? f.usd(stuck) : null}
        label={copy.stuck}
        barRef={stuckRef}
        width={ready ? share(stuck) : 0}
        barClass={cn("border border-warn bg-warn/15", styles.hatch)}
        tone="text-warn"
        loading={loading}
      />
      <div ref={ratioRef} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {loading ? (
          <SkeletonMetric size="lg" chars={5} />
        ) : (
          <span className="font-mono text-metric-lg text-liq-hi">{ratio !== null ? f.ratio(ratio) : "–"}</span>
        )}
        <span className="label-mono text-fg-3">{copy.ratioLabel}</span>
      </div>
      <figcaption className={cn("text-body-sm text-fg-2", loading && "sr-only")}>
        {caption}
        {ready && cleared > 0 && stuck > 0 && cleared < stuck && (
          <span className="text-fg-3"> {fill(copy.hairline, { share: f.pct(cleared / stuck) })}</span>
        )}
      </figcaption>
      {footnote}
    </figure>
  );
}

/** The elements the live chart animates (bars grow context → hero, the ratio fades in last). */
export type GapBarsRefs = {
  root?: Ref<HTMLElement>;
  cleared?: Ref<HTMLSpanElement>;
  stuck?: Ref<HTMLSpanElement>;
  ratio?: Ref<HTMLDivElement>;
};

/** The complete chart as static server HTML (no client code): the live `GapBars` renders the same markup. */
export function GapBarsStatic(props: GapBarsProps) {
  return <GapBarsView {...props} />;
}

function Row({
  value,
  label,
  barRef,
  width,
  barClass,
  tone,
  loading,
}: {
  value: string | null;
  label: string;
  barRef?: Ref<HTMLSpanElement>;
  width: number;
  barClass: string;
  tone?: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {value === null ? (
          <Skeleton className="h-[0.8em] w-[7ch] self-center" />
        ) : (
          <span className={cn("font-mono text-metric-sm", tone ?? "text-fg-1")}>{value}</span>
        )}
        <span className="text-body-sm text-fg-2">{label}</span>
      </p>
      <span aria-hidden className="relative block h-3 w-full rounded-[2px] bg-line/60">
        {!loading && (
          <span
            ref={barRef}
            className={cn("absolute inset-y-0 left-0 block origin-left rounded-[2px]", barClass)}
            style={{ width: `max(1px, ${pct(width)})` }}
          />
        )}
      </span>
    </div>
  );
}
