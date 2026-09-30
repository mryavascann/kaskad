"use client";

import { Droplet, Globe, type LucideIcon } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fill, mergeCopy } from "./copy";
import { DataTable } from "./data-table";
import { withFormats, type Formatter } from "./format";
import { StateBox, chartStatus, type StateCopy } from "./frame";
import { pct } from "./geometry";
import { CURVE_VIEW, SERIES, curveGeometry, nearestIndex, type CurveData, type OracleSeries } from "./curve-model";

export type StressCurveCopy = StateCopy & {
  label: string;
  external: string;
  externalNote: string;
  pool: string;
  poolNote: string;
  shockKey: string;
  badDebtKey: string;
  marker: string;
  explore: string;
  valueText: string;
  summary: string;
  seriesSummary: string;
  firstLoss: string;
  noLoss: string;
  allZero: string;
  tableSummary: string;
  tableCaption: string;
};

export const STRESS_CURVE_COPY: StressCurveCopy = {
  label: "Stress curve",
  external: "External price",
  externalNote: "realistic",
  pool: "Pool price",
  poolNote: "worst case",
  shockKey: "Shock",
  badDebtKey: "Bad debt",
  marker: "Scenario {shock}",
  explore: "Shock level",
  valueText: "Shock {shock}: bad debt {external} with the external price, {pool} with the pool price",
  summary: "Bad debt at {count} shock levels, {min} to {max}. {external}. {pool}.",
  seriesSummary: "{name} ({note}): {first}, {last} at {max}",
  firstLoss: "bad debt from a {shock} shock",
  noLoss: "no bad debt",
  allZero: "No bad debt at any shock level in either oracle mode.",
  tableSummary: "Data table",
  tableCaption: "Bad debt per shock level, both oracle modes",
  loading: "Loading the stress curve",
  emptyTitle: "No shock levels",
  emptyBody: "The curve has no points to draw.",
  errorTitle: "Couldn't load the stress curve",
};

type StressCurveProps = {
  /** `curveFromChain(curve, shocksBps)`; null while loading. */
  data: CurveData | null;
  /** A shock (fraction) to mark, e.g. the scenario's. */
  marker?: number;
  error?: ReactNode;
  errorAction?: ReactNode;
  locale?: string;
  formatUsd?: Formatter;
  formatPct?: Formatter;
  formatUsdTick?: Formatter;
  formatPctTick?: Formatter;
  copy?: Partial<StressCurveCopy>;
  className?: string;
  plotClassName?: string;
  id?: string;
};

const STYLE: Record<OracleSeries, { stroke: string; dash?: string; cap: "round" | "square"; icon: LucideIcon; text: string }> = {
  external: { stroke: "var(--color-warn)", cap: "round", icon: Globe, text: "text-warn" },
  pool: { stroke: "var(--color-liq)", dash: "6 4", cap: "square", icon: Droplet, text: "text-liq-hi" },
};

const PLOT = "h-56 sm:h-64 lg:h-72";

/**
 * Bad debt against the shock for the two oracle models: the external price (realistic, solid line,
 * round markers) and the pool price (worst case, dashed, square markers). A crosshair reads both
 * values at a shock level on hover, and on focus with the arrow keys.
 */
export function StressCurve({
  data,
  marker,
  error,
  errorAction,
  locale,
  formatUsd,
  formatPct,
  formatUsdTick,
  formatPctTick,
  copy: copyProp,
  className,
  plotClassName,
  id,
}: StressCurveProps) {
  const copy = mergeCopy(STRESS_CURVE_COPY, copyProp);
  const f = withFormats(locale, { usd: formatUsd, pct: formatPct, usdTick: formatUsdTick, pctTick: formatPctTick });
  const status = chartStatus(data, error, (data?.shocks.length ?? 0) === 0);
  const plotBox = cn("relative", plotClassName ?? PLOT);
  const geo = useMemo(() => (data && data.shocks.length ? curveGeometry(data, f.pctTick) : null), [data, f.pctTick]);
  const [active, setActive] = useState<number | null>(null);
  const summaryId = `${useId()}-summary`;

  const legend = (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption">
      {SERIES.map((s) => {
        const Icon = STYLE[s].icon;
        return (
          <li key={s} className="flex items-center gap-2">
            <svg aria-hidden viewBox="0 0 28 8" className="h-2 w-7 overflow-visible">
              <path d="M1 4H27" stroke={STYLE[s].stroke} strokeWidth={1.75} strokeDasharray={STYLE[s].dash} />
              <path d="M14 4h0" stroke={STYLE[s].stroke} strokeWidth={7} strokeLinecap={STYLE[s].cap} />
            </svg>
            <Icon aria-hidden className={cn("size-3.5", STYLE[s].text)} />
            <span className="text-fg-1">{copy[s]}</span>
            <span className="text-fg-3">{s === "external" ? copy.externalNote : copy.poolNote}</span>
          </li>
        );
      })}
    </ul>
  );

  if (status !== "ready" || !data || !geo) {
    return (
      <figure id={id} data-slot="stress-curve" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
        {legend}
        <StateBox status={status === "ready" ? "loading" : status} className={plotBox} copy={copy} error={error} errorAction={errorAction} />
        <div aria-hidden className="h-[1lh] text-label" />
      </figure>
    );
  }

  const n = data.shocks.length;
  const xs = geo.xTicks.map((t) => t.x);
  const shockText = (i: number) => f.pct(data.shocks[i]);
  const valueText = (i: number) => fill(copy.valueText, { shock: shockText(i), external: f.usd(data.external[i] ?? 0), pool: f.usd(data.pool[i] ?? 0) });
  const seriesSummary = (s: OracleSeries) => {
    const vs = data[s];
    const first = vs.findIndex((v) => v > 0);
    return fill(copy.seriesSummary, {
      name: copy[s],
      note: s === "external" ? copy.externalNote : copy.poolNote,
      first: first < 0 ? copy.noLoss : fill(copy.firstLoss, { shock: shockText(first) }),
      last: f.usd(vs[n - 1] ?? 0),
      max: shockText(n - 1),
    });
  };
  const summary = fill(copy.summary, {
    count: f.int(n),
    min: shockText(0),
    max: shockText(n - 1),
    external: seriesSummary("external"),
    pool: seriesSummary("pool"),
  });

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) setActive(nearestIndex(xs, (event.clientX - box.left) / box.width));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = active ?? 0;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? Math.min(n - 1, i + 1)
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? Math.max(0, i - 1)
          : event.key === "Home" || event.key === "PageDown"
            ? 0
            : event.key === "End" || event.key === "PageUp"
              ? n - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };
  const markerX = marker !== undefined && marker > 0 ? geo.x(marker) : null;

  return (
    <figure id={id} data-slot="stress-curve" aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-4", className)}>
      {legend}
      <div className="flex min-w-0 gap-3">
        {/* y axis: bad debt */}
        <div aria-hidden className={cn("relative w-12 shrink-0", plotBox)}>
          {geo.yTicks.map((t) => (
            <span key={t.value} className="label-mono absolute right-0 -translate-y-1/2 whitespace-nowrap text-fg-3" style={{ top: pct(t.y) }}>
              {f.usdTick(t.value)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className={plotBox}>
            <svg aria-hidden viewBox={`0 0 ${CURVE_VIEW.w} ${CURVE_VIEW.h}`} preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible" fill="none">
              {geo.yTicks.map((t) => (
                <line
                  key={t.value}
                  x1={0}
                  x2={CURVE_VIEW.w}
                  y1={t.y * CURVE_VIEW.h}
                  y2={t.y * CURVE_VIEW.h}
                  stroke={t.value === 0 ? "var(--color-line-3)" : "var(--color-line)"}
                  vectorEffect="non-scaling-stroke"
                  shapeRendering="crispEdges"
                />
              ))}
              {geo.xTicks.map((t) => (
                <line key={t.shock} x1={t.x * CURVE_VIEW.w} x2={t.x * CURVE_VIEW.w} y1={0} y2={CURVE_VIEW.h} stroke="var(--color-line)" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
              ))}
              {SERIES.map((s) => (
                <g key={s} data-series={s}>
                  <path d={geo.paths[s]} stroke={STYLE[s].stroke} strokeWidth={1.75} strokeDasharray={STYLE[s].dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  {geo.points[s].map((p, i) => (
                    <path
                      key={p.shock}
                      d={`M${p.x * CURVE_VIEW.w} ${p.y * CURVE_VIEW.h}h0`}
                      stroke={STYLE[s].stroke}
                      strokeWidth={active === i ? 11 : 7}
                      strokeLinecap={STYLE[s].cap}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              ))}
            </svg>

            {markerX !== null && marker !== undefined && (
              <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: pct(markerX) }}>
                <span className="absolute inset-y-0 left-0 w-0 border-l border-dashed border-fg-3" />
                <span className="label-mono absolute top-0.5 whitespace-nowrap text-fg-2" style={markerX <= 0.5 ? { left: "0.4rem" } : { right: "0.4rem" }}>
                  {fill(copy.marker, { shock: f.pct(marker) })}
                </span>
              </div>
            )}

            {active !== null && <Crosshair i={active} geo={geo} data={data} copy={copy} usd={f.usd} shock={shockText(active)} />}

            {/* The explorer: pointer anywhere on the plot, or focus + arrow keys. */}
            <div
              role="slider"
              tabIndex={0}
              aria-label={copy.explore}
              aria-valuemin={0}
              aria-valuemax={n - 1}
              aria-valuenow={active ?? 0}
              aria-valuetext={valueText(active ?? 0)}
              aria-describedby={summaryId}
              className="absolute inset-0 cursor-crosshair rounded-control focus-visible:outline-offset-4"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive((a) => a ?? 0)}
              onBlur={() => setActive(null)}
              onKeyDown={onKey}
            />
          </div>
          <div aria-hidden className="@container relative h-[1lh] text-label">
            {geo.xTicks.map((t) => (
              <span
                key={t.shock}
                className={cn("label-mono absolute top-0 whitespace-nowrap text-fg-3", t.hide)}
                style={{ left: pct(t.x), transform: `translateX(-${pct(t.x)})` }}
              >
                {f.pctTick(t.shock)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      {geo.allZero && <p className="text-caption text-fg-3">{copy.allZero}</p>}
      <DataTable
        summary={copy.tableSummary}
        caption={copy.tableCaption}
        rows={data.shocks.map((shock, i) => ({ shock, external: data.external[i] ?? 0, pool: data.pool[i] ?? 0 }))}
        rowKey={(r) => r.shock}
        columns={[
          { label: copy.shockKey, numeric: true, cell: (r) => f.pct(r.shock) },
          { label: copy.external, numeric: true, cell: (r) => f.usd(r.external) },
          { label: copy.pool, numeric: true, cell: (r) => f.usd(r.pool) },
        ]}
      />
    </figure>
  );
}

function Crosshair({
  i,
  geo,
  data,
  copy,
  usd,
  shock,
}: {
  i: number;
  geo: NonNullable<ReturnType<typeof curveGeometry>>;
  data: CurveData;
  copy: StressCurveCopy;
  usd: Formatter;
  shock: string;
}) {
  const x = geo.xTicks[i].x;
  return (
    <div aria-hidden data-slot="crosshair" className="pointer-events-none absolute inset-0">
      <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-fg-2" style={{ left: pct(x) }} />
      {/* Anchor slides with the position (left edge at 0 %, right edge at 100 %): never leaves the plot. */}
      <div
        className="absolute top-2 w-max max-w-full min-w-40 rounded-control border border-line-3 bg-elev-2/95 px-3 py-2 shadow-pop backdrop-blur-sm"
        style={{ left: pct(x), transform: `translateX(-${pct(x)})` }}
      >
        <p className="label-mono text-fg-3">
          {copy.shockKey} <span className="text-fg-1">{shock}</span>
        </p>
        <dl className="mt-1.5 flex flex-col gap-1 font-mono text-caption">
          {SERIES.map((s) => (
            <div key={s} className="flex items-baseline justify-between gap-4">
              <dt className={STYLE[s].text}>{copy[s]}</dt>
              <dd className="text-fg-1">{usd(data[s][i] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
