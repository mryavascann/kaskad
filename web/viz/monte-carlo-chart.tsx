import { CircleCheck } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { duration } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { DataTable } from "./data-table";
import { withFormats, type Formatter } from "./format";
import { StateBox, chartStatus, type StateCopy } from "./frame";
import { pct, round } from "./geometry";
import { mcGeometry, type MonteCarloData } from "./monte-carlo-model";
import styles from "./viz.module.css";

export type MonteCarloCopy = StateCopy & {
  label: string;
  lossPaths: string;
  lossShare: string;
  meanTag: string;
  p95Tag: string;
  worstTag: string;
  worstAt: string;
  withLoss: string;
  withoutLoss: string;
  shockKey: string;
  badDebtKey: string;
  pathKey: string;
  summary: string;
  summaryNoLoss: string;
  noLoss: string;
  /** Legend of the no-loss histogram (bars: how many paths ended in each shock range). */
  binKey: string;
  tableSummary: string;
  tableCaption: string;
};

export const MONTE_CARLO_COPY: MonteCarloCopy = {
  label: "Monte Carlo",
  lossPaths: "Paths with bad debt",
  lossShare: "{loss} of {paths}",
  meanTag: "Mean",
  p95Tag: "p95",
  worstTag: "Worst",
  worstAt: "at {shock}",
  withLoss: "Path with bad debt",
  withoutLoss: "Path without",
  shockKey: "Shock",
  badDebtKey: "Bad debt",
  pathKey: "Path",
  summary:
    "{paths} random price paths with a mean shock of {meanShock}: {loss} of them ({share}) end with bad debt. Mean bad debt {mean}, 95th percentile {p95}, worst {worst} (shock {worstShock}).",
  summaryNoLoss: "{paths} random price paths with a mean shock of {meanShock}, up to {maxShock}: none ends with bad debt.",
  noLoss: "No path ends with bad debt.",
  binKey: "Paths per shock range",
  tableSummary: "Data table",
  tableCaption: "Every path: final shock and bad debt",
  loading: "Loading the Monte Carlo paths",
  emptyTitle: "No paths",
  emptyBody: "The run returned no price paths.",
  errorTitle: "Couldn't run the Monte Carlo paths",
};

type MonteCarloChartProps = {
  /** `monteCarloFacts(result)`; null while loading. */
  facts: MonteCarloData | null;
  error?: ReactNode;
  errorAction?: ReactNode;
  locale?: string;
  formatUsd?: Formatter;
  formatPct?: Formatter;
  formatInt?: Formatter;
  formatUsdTick?: Formatter;
  formatPctTick?: Formatter;
  copy?: Partial<MonteCarloCopy>;
  className?: string;
  plotClassName?: string;
  id?: string;
};

const PLOT = "h-56 sm:h-64";
const W = 1000;
const H = 300;

/**
 * One dot per random price path: its final shock against the bad debt it left, with the mean and the
 * 95th percentile as lines and the worst path ringed, plus the share of paths that lose money. The
 * dots arrive in path order (CSS, at first paint); reduced motion shows them at once.
 */
export function MonteCarloChart({
  facts,
  error,
  errorAction,
  locale,
  formatUsd,
  formatPct,
  formatInt,
  formatUsdTick,
  formatPctTick,
  copy: copyProp,
  className,
  plotClassName,
  id,
}: MonteCarloChartProps) {
  const copy = mergeCopy(MONTE_CARLO_COPY, copyProp);
  const f = withFormats(locale, { usd: formatUsd, pct: formatPct, int: formatInt, usdTick: formatUsdTick, pctTick: formatPctTick });
  const status = chartStatus(facts, error, (facts?.points.length ?? 0) === 0);
  const plotBox = cn("relative", plotClassName ?? PLOT);

  if (status !== "ready" || !facts) {
    return (
      <figure id={id} data-slot="monte-carlo" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
        <div aria-hidden className="h-[1lh] text-caption" />
        <StateBox status={status === "ready" ? "loading" : status} className={plotBox} copy={copy} error={error} errorAction={errorAction} />
        <div aria-hidden className="h-[1lh] text-label" />
      </figure>
    );
  }

  const geo = mcGeometry(facts, f.pctTick);
  const shock = (percent: number) => f.pct(percent / 100);
  const any = geo.meanY !== null;
  const maxShock = Math.max(0, ...facts.points.map((p) => p.shockPct));
  const summary = any
    ? fill(copy.summary, {
        paths: f.int(facts.paths),
        meanShock: shock(facts.meanShockPct),
        loss: f.int(facts.lossPaths),
        share: f.pct(facts.lossPathShare),
        mean: f.usd(facts.meanBadDebtUsd),
        p95: f.usd(facts.p95BadDebtUsd),
        worst: f.usd(facts.worstBadDebtUsd),
        worstShock: shock(facts.worstShockPct),
      })
    : fill(copy.summaryNoLoss, { paths: f.int(facts.paths), meanShock: shock(facts.meanShockPct), maxShock: shock(maxShock) });
  const spread = duration.scene;
  const n = geo.dots.length;

  return (
    <figure id={id} data-slot="monte-carlo" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption">
        <p className="flex items-baseline gap-2">
          <span className="label-mono text-fg-3">{copy.lossPaths}</span>
          <span className={cn("font-mono", facts.lossPaths > 0 ? "text-liq-hi" : "text-fg-1")}>
            {fill(copy.lossShare, { loss: f.int(facts.lossPaths), paths: f.int(facts.paths) })}
          </span>
          <span className="font-mono text-fg-3">{f.pct(facts.lossPathShare)}</span>
        </p>
        <span aria-hidden className="flex h-1.5 w-28 overflow-hidden rounded-[2px] bg-calm/30">
          <span className="h-full bg-liq" style={{ width: pct(facts.lossPathShare) }} />
        </span>
        <ul aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-2">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-liq" />
            {copy.withLoss}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-calm" />
            {copy.withoutLoss}
          </li>
          {!any && (
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2.5 rounded-[1px] bg-calm/30" />
              {copy.binKey}
            </li>
          )}
        </ul>
      </div>

      {any && (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-caption">
          <MarkerFact sample={<span className="h-px w-4 bg-fg-2" />} term={copy.meanTag} value={f.usd(facts.meanBadDebtUsd)} />
          <MarkerFact sample={<span className="w-4 border-t border-dashed border-warn" />} term={copy.p95Tag} value={f.usd(facts.p95BadDebtUsd)} />
          <MarkerFact
            sample={<span className="size-2.5 rounded-full border border-liq-hi" />}
            term={copy.worstTag}
            value={`${f.usd(facts.worstBadDebtUsd)} ${fill(copy.worstAt, { shock: shock(facts.worstShockPct) })}`}
          />
        </dl>
      )}

      <div className="flex min-w-0 gap-3">
        <div aria-hidden className={cn("relative w-12 shrink-0", plotBox)}>
          {geo.yTicks.map((t) => (
            <span key={t.value} className="label-mono absolute right-0 -translate-y-1/2 whitespace-nowrap text-fg-3" style={{ top: pct(t.y) }}>
              {f.usdTick(t.value)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div role="img" aria-label={summary} className={plotBox}>
            <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible" fill="none">
              {geo.yTicks.map((t) => (
                <line
                  key={t.value}
                  x1={0}
                  x2={W}
                  y1={round(t.y * H)}
                  y2={round(t.y * H)}
                  stroke={t.value === 0 ? "var(--color-line-3)" : "var(--color-line)"}
                  vectorEffect="non-scaling-stroke"
                  shapeRendering="crispEdges"
                />
              ))}
              {geo.bins.map((b) =>
                b.count > 0 ? (
                  <rect
                    key={b.x}
                    x={round((b.x + b.w * 0.08) * W)}
                    width={round(b.w * 0.84 * W)}
                    y={round((1 - b.h) * H)}
                    height={round(b.h * H)}
                    fill="var(--color-calm)"
                    fillOpacity={0.16}
                  />
                ) : null,
              )}
              {geo.p95Y !== null && (
                <line x1={0} x2={W} y1={round(geo.p95Y * H)} y2={round(geo.p95Y * H)} stroke="var(--color-warn)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              )}
              {geo.meanY !== null && (
                <line x1={0} x2={W} y1={round(geo.meanY * H)} y2={round(geo.meanY * H)} stroke="var(--color-fg-2)" vectorEffect="non-scaling-stroke" />
              )}
              {geo.dots.map((d, k) => (
                <path
                  key={d.i}
                  data-loss={d.loss || undefined}
                  className={styles.pop}
                  d={`M${round(d.x * W)} ${round(d.y * H)}h0`}
                  stroke={d.loss ? "var(--color-liq)" : "var(--color-calm)"}
                  strokeOpacity={d.loss ? 0.9 : 0.75}
                  strokeWidth={6}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ "--flip-delay": `${Math.round((k / Math.max(1, n)) * spread)}ms` } as CSSProperties}
                />
              ))}
            </svg>

            {geo.meanY !== null && (
              <span aria-hidden className="label-mono absolute left-1 -translate-y-full pb-0.5 text-fg-2" style={{ top: pct(geo.meanY) }}>
                {copy.meanTag}
              </span>
            )}
            {geo.p95Y !== null && (
              <span aria-hidden className="label-mono absolute left-1 translate-y-0.5 text-warn" style={{ top: pct(geo.p95Y) }}>
                {copy.p95Tag}
              </span>
            )}
            {/* No loss: the dots all sit on the $0 line and the bars show how far the paths' shocks spread
                (the box keeps its height: same box in every state); the note is one line at the top. */}
            {geo.bins.map((b) =>
              b.count > 0 ? (
                <span
                  key={b.x}
                  aria-hidden
                  className="label-mono absolute -translate-x-1/2 -translate-y-full pb-0.5 text-fg-3"
                  style={{ left: pct(b.x + b.w / 2), top: pct(1 - b.h) }}
                >
                  {f.int(b.count)}
                </span>
              ) : null,
            )}
            {!any && (
              <p aria-hidden className="absolute inset-x-0 top-0 flex items-center gap-2 text-body-sm font-medium text-fg-1">
                <CircleCheck className="size-4 shrink-0 text-safe" />
                {copy.noLoss}
              </p>
            )}
            {geo.worst && (
              <div aria-hidden className="pointer-events-none absolute" style={{ left: pct(geo.worst.x), top: pct(geo.worst.y) }}>
                <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-liq-hi" />
                <span className="label-mono absolute top-2 whitespace-nowrap text-liq-hi" style={geo.worst.x > 0.6 ? { right: "0.6rem" } : { left: "0.6rem" }}>
                  {copy.worstTag}
                </span>
              </div>
            )}
          </div>
          <div aria-hidden className="@container relative h-[1lh] text-label">
            {geo.xTicks.map((t) => (
              <span
                key={t.pct}
                className={cn("label-mono absolute top-0 whitespace-nowrap text-fg-3", t.hide)}
                style={{ left: pct(t.x), transform: `translateX(-${pct(t.x)})` }}
              >
                {f.pctTick(t.pct / 100)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <DataTable
        summary={copy.tableSummary}
        caption={copy.tableCaption}
        rows={facts.points.map((p, i) => ({ i, ...p }))}
        rowKey={(r) => r.i}
        columns={[
          { label: copy.pathKey, numeric: true, cell: (r) => f.int(r.i + 1) },
          { label: copy.shockKey, numeric: true, cell: (r) => shock(r.shockPct) },
          { label: copy.badDebtKey, numeric: true, cell: (r) => f.usd(r.badDebtUsd) },
        ]}
      />
    </figure>
  );
}

function MarkerFact({ sample, term, value }: { sample: ReactNode; term: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="flex w-4 items-center justify-center">
        {sample}
      </span>
      <dt className="label-mono text-fg-3">{term}</dt>
      <dd className="font-mono text-fg-1">{value}</dd>
    </div>
  );
}
