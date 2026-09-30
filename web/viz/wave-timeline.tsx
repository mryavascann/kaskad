"use client";

import {
  AnimatePresence,
  animate,
  m,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Slider } from "@/design/ui/slider";
import { TickRuler } from "@/design/ui/tick-ruler";
import { cn } from "@/lib/utils";
import { useForcedReducedMotion, useShouldReduceMotion } from "@/motion/hooks";
import { duration, easing, spring, toSeconds } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { DataTable } from "./data-table";
import { withFormats, type Formatter, type VizFormats } from "./format";
import { StateBox, chartStatus, type StateCopy } from "./frame";
import { LABEL_CHAR_REM, blockInset, blockX, hideBelow, markerLabel, pct, round } from "./geometry";
import { LANES, VIEW, majorEvery, penY, timelineGeometry, type TimelineInput, type TimelineVariant } from "./timeline-model";
import { useEnterView } from "./use-enter-view";
import styles from "./viz.module.css";

export type WaveTimelineCopy = StateCopy & {
  /** Accessible name of the figure. */
  label: string;
  /** First axis label. */
  axisStart: string;
  blockKey: string;
  priceKey: string;
  liquidatedKey: string;
  liquidationsKey: string;
  /** Readout at the playhead: debt liquidated in that block, and in blocks 0 … playhead. */
  inBlockKey: string;
  soFarKey: string;
  wavesKey: string;
  /** Marker label at the first liquidation. */
  firstLiquidation: string;
  /** Note under the chart when liquidations stall. */
  stalled: string;
  /** Short tag on the stalled stretch. */
  stalledTag: string;
  noLiquidations: string;
  /** role="img" summary. */
  summary: string;
  summaryFirst: string;
  /** Scrubber name and value text. */
  scrubber: string;
  valueText: string;
  tableSummary: string;
  tableCaption: string;
};

export const WAVE_TIMELINE_COPY: WaveTimelineCopy = {
  label: "Cascade timeline",
  axisStart: "Block {block}",
  blockKey: "Block",
  priceKey: "Oracle price",
  liquidatedKey: "Liquidated",
  liquidationsKey: "Liquidations",
  inBlockKey: "In this block",
  soFarKey: "Liquidated so far",
  wavesKey: "Waves",
  firstLiquidation: "Block {block} · first liquidation",
  stalled: "Liquidations stopped at block {block}: no profitable sale left in the pool",
  stalledTag: "Stalled",
  noLiquidations: "No liquidations in this run.",
  summary:
    "Cascade over {blocks} blocks. Oracle price {start} to {end} ({change}). Liquidations: {liquidations}. Waves: {waves}. Blocks with liquidations: {active}. Debt liquidated: {liquidated}.",
  summaryFirst: "First liquidation in block {block}.",
  scrubber: "Block",
  valueText: "Block {block} of {steps}: oracle price {price}, liquidated {liquidated}, waves {waves}",
  tableSummary: "Data table",
  tableCaption: "Per block: oracle price, debt liquidated, liquidations and waves",
  loading: "Loading the cascade",
  emptyTitle: "No blocks to show",
  emptyBody: "The run has no price path.",
  errorTitle: "Couldn't load the cascade",
};

type WaveTimelineProps = {
  /** `cascadeTimeline(result, scenario)`; null while the preview loads. */
  timeline: TimelineInput | null;
  /** `console`: price line, bars, labels, readout, table. `trace`: a big seismograph for the landing. */
  variant?: TimelineVariant;
  /** Playhead block (0 … steps). Omit for no playhead. */
  step?: number;
  /** Adds the scrubber (a slider under the axis). */
  onStepChange?: (step: number) => void;
  /**
   * How the needle writes the trace (static under reduced motion):
   * - `replay` (default): the server renders the finished chart; if it scrolls into view after the page
   *   loaded, the needle redraws it left to right.
   * - `reveal`: hidden until it is in view, then drawn (an entrance for heroes; visible without
   *   JavaScript through RevealNoScript).
   * - `none`: static.
   */
  entrance?: TimelineEntrance;
  /** Data table disclosure. Default: on for `console`, off for `trace`. */
  table?: boolean;
  /** Shows the error state (a message or node). */
  error?: ReactNode;
  errorAction?: ReactNode;
  locale?: string;
  formatPrice?: Formatter;
  formatUsd?: Formatter;
  formatChange?: Formatter;
  formatInt?: Formatter;
  copy?: Partial<WaveTimelineCopy>;
  className?: string;
  /** Plot height classes. */
  plotClassName?: string;
  id?: string;
};

export type TimelineEntrance = "replay" | "reveal" | "none";

const PLOT = {
  console: "h-64 sm:h-72 lg:h-80",
  trace: "h-44 sm:h-60 lg:h-80",
} as const;

const SEV: Record<2 | 3 | 4, string> = { 2: "var(--color-sev-2)", 3: "var(--color-sev-3)", 4: "var(--color-sev-4)" };

/**
 * The console's centerpiece: oracle price per block (line) and debt liquidated per block (bars),
 * a block axis, the first liquidation marked, the stall explained, an optional playhead with a
 * scrubber. `variant="trace"` is the landing's seismograph: spikes proportional to the debt
 * liquidated per block on a calm baseline, plus the price path, ticks only. Every mark is a number
 * from the run.
 */
export function WaveTimeline({
  timeline,
  variant = "console",
  step,
  onStepChange,
  entrance = "replay",
  table,
  error,
  errorAction,
  locale,
  formatPrice,
  formatUsd,
  formatChange,
  formatInt,
  copy: copyProp,
  className,
  plotClassName,
  id,
}: WaveTimelineProps) {
  const copy = mergeCopy(WAVE_TIMELINE_COPY, copyProp);
  const f = withFormats(locale, { price: formatPrice, usd: formatUsd, change: formatChange, int: formatInt });
  const status = chartStatus(timeline, error, (timeline?.points.length ?? 0) < 2);
  const plotBox = cn("relative w-full", plotClassName ?? PLOT[variant]);
  const isConsole = variant === "console";

  if (status !== "ready" || !timeline) {
    return (
      <figure
        id={id}
        data-slot="wave-timeline"
        data-variant={variant}
        aria-label={copy.label}
        className={cn("flex min-w-0 flex-col gap-3", className)}
      >
        {isConsole && <div aria-hidden className="min-h-[1lh] text-caption" />}
        <StateBox status={status === "ready" ? "loading" : status} className={plotBox} copy={copy} error={error} errorAction={errorAction} />
        <div aria-hidden className={isConsole ? "h-11" : "h-3"} />
        {onStepChange && <div aria-hidden className="h-9" />}
      </figure>
    );
  }

  return (
    <TimelineChart
      id={id}
      timeline={timeline}
      variant={variant}
      step={step}
      onStepChange={onStepChange}
      entrance={entrance}
      showTable={table ?? isConsole}
      copy={copy}
      f={f}
      plotBox={plotBox}
      className={className}
    />
  );
}

type ChartProps = {
  id?: string;
  timeline: TimelineInput;
  variant: TimelineVariant;
  step?: number;
  onStepChange?: (step: number) => void;
  entrance: TimelineEntrance;
  showTable: boolean;
  copy: WaveTimelineCopy;
  f: VizFormats;
  plotBox: string;
  className?: string;
};

function TimelineChart({ id, timeline, variant, step, onStepChange, entrance, showTable, copy, f, plotBox, className }: ChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const geo = useMemo(() => timelineGeometry(timeline, variant), [timeline, variant]);
  const { facts, steps } = geo;
  const reduce = useShouldReduceMotion();
  const forced = useForcedReducedMotion();
  const plotRef = useRef<HTMLDivElement>(null);
  const inView = useInView(plotRef, { once: true, amount: 0.35 });
  const entered = useEnterView(plotRef);

  // ---- draw-in: one progress value (0 → 1) reveals the plot left to right. Once drawing, it only
  // moves forward: new data mid-draw keeps drawing from where the needle is.
  const reveal = entrance === "reveal" && !forced;
  const progress = useMotionValue(reveal ? 0 : 1);
  const [drawing, setDrawing] = useState(false);
  const clipRef = useRef<SVGRectElement>(null);
  useMotionValueEvent(progress, "change", (p) => clipRef.current?.setAttribute("transform", `scale(${round(p, 4)} 1)`));
  useMotionValueEvent(progress, "animationStart", () => setDrawing(true));
  useMotionValueEvent(progress, "animationComplete", () => setDrawing(false));
  useMotionValueEvent(progress, "animationCancel", () => setDrawing(false));
  const write = entrance === "none" || forced ? false : entrance === "reveal" ? inView : entered;
  useEffect(() => {
    if (!write) return;
    if (reduce) {
      progress.jump(1);
      return;
    }
    if (entrance === "replay") progress.jump(0);
    else if (progress.get() >= 1) return;
    const controls = animate(progress, 1, { duration: toSeconds(duration.sceneLong), ease: easing.linear });
    return () => controls.stop();
  }, [write, entrance, reduce, progress]);

  // ---- bars / spikes retarget from their previous height (FLIP on scaleY) when the data changes.
  const markRefs = useRef(new Map<number, SVGElement>());
  const prevHeights = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    const prev = prevHeights.current;
    prevHeights.current = new Map(geo.marks.map((mk) => [mk.step, mk.height]));
    if (!prev || reduce) return;
    const running = geo.marks.flatMap((mk) => {
      const el = markRefs.current.get(mk.step);
      const from = (prev.get(mk.step) ?? 0) / mk.height;
      return el && Math.abs(from - 1) > 0.001 ? [animate(el, { scaleY: [from, 1] }, spring.soft)] : [];
    });
    return () => running.forEach((c) => c.stop());
  }, [geo, reduce]);
  const markRef = (key: number) => (el: SVGElement | null) => {
    if (el) markRefs.current.set(key, el);
    else markRefs.current.delete(key);
  };

  const current = step === undefined ? undefined : Math.max(0, Math.min(steps, Math.round(step)));
  const point = current === undefined ? undefined : timeline.points[current];
  const soFar = current === undefined ? 0 : timeline.points.slice(0, current + 1).reduce((sum, p) => sum + p.liquidated, 0);
  const inset = pct(blockInset(steps));
  const isConsole = variant === "console";
  const values = {
    blocks: f.int(steps),
    start: f.price(facts.startPrice),
    end: f.price(facts.endPrice),
    change: f.change(facts.change),
    liquidations: f.int(facts.liquidations),
    waves: f.int(facts.waves),
    active: f.int(facts.activeBlocks),
    liquidated: f.usd(facts.liquidated),
  };
  const stalledNote = facts.stalled ? fill(copy.stalled, { block: f.int(facts.lastActiveStep) }) : null;
  const summary = [
    fill(copy.summary, values),
    facts.firstStep !== null ? fill(copy.summaryFirst, { block: f.int(facts.firstStep) }) : copy.noLiquidations,
    stalledNote ? `${stalledNote}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const valueText = (s: number) => {
    const p = timeline.points[Math.max(0, Math.min(steps, s))];
    return fill(copy.valueText, { block: f.int(s), steps: f.int(steps), price: f.price(p.price), liquidated: f.usd(p.liquidated), waves: f.int(p.waves) });
  };
  const firstLabel =
    facts.firstStep === null
      ? null
      : fill(copy.firstLiquidation, { block: f.int(facts.firstStep) }) + (!isConsole && facts.stalled ? ` · ${copy.stalledTag}` : "");
  const peakMark = facts.peak ? geo.marks.find((mk) => mk.step === facts.peak?.step) : undefined;
  const trace = `url(#${uid}-trace)`;

  return (
    <figure id={id} data-slot="wave-timeline" data-variant={variant} aria-label={copy.label} className={cn("flex min-w-0 flex-col gap-3", className)}>
      {isConsole && (
        <dl aria-hidden className="flex min-h-[1lh] flex-wrap items-baseline gap-x-6 gap-y-1 text-caption">
          {point && current !== undefined ? (
            <>
              <Fact term={copy.blockKey} value={`${f.int(current)} / ${f.int(steps)}`} />
              <Fact term={copy.priceKey} value={f.price(point.price)} />
              <Fact term={copy.inBlockKey} value={f.usd(point.liquidated)} tone={point.liquidated > 0 ? "text-liq-hi" : undefined} />
              <Fact term={copy.wavesKey} value={f.int(point.waves)} />
              <Fact term={copy.soFarKey} value={f.usd(soFar)} tone={soFar > 0 ? "text-liq-hi" : undefined} />
            </>
          ) : (
            <>
              <Fact term={copy.priceKey} value={`${values.start} → ${values.end}`} extra={values.change} />
              <Fact term={copy.liquidatedKey} value={values.liquidated} tone={facts.liquidated > 0 ? "text-liq-hi" : undefined} />
              <Fact term={copy.liquidationsKey} value={values.liquidations} />
              <Fact term={copy.wavesKey} value={values.waves} />
            </>
          )}
        </dl>
      )}

      <div ref={plotRef} role="img" aria-label={summary} className={cn(plotBox, "@container isolate")}>
        {/* Marker strip above the plot: the first-liquidation label never collides with plot labels. */}
        {geo.phase.first !== null && firstLabel && (
          <RevealOn
            progress={progress}
            at={geo.phase.first}
            className="pointer-events-none absolute inset-0"
            style={{ "--x": pct(geo.phase.first) } as CSSProperties}
          >
            <span className="absolute top-2 bottom-0 left-(--x) w-0 border-l border-dashed border-liq/80" />
            <span
              className={cn(
                "label-mono absolute top-0 max-w-full truncate bg-[var(--viz-surface,var(--color-elev-1))] px-1 text-liq-hi",
                markerLabel(geo.phase.first, firstLabel.length).className,
              )}
            >
              {firstLabel}
            </span>
          </RevealOn>
        )}

        <div className="absolute inset-x-0 top-6 bottom-0 overflow-hidden">
          <svg aria-hidden viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="none" className="absolute inset-0 block size-full" fill="none">
            <defs>
              <clipPath id={`${uid}-clip`} clipPathUnits="userSpaceOnUse">
                <rect
                  ref={clipRef}
                  data-reveal={reveal ? "" : undefined}
                  x={-24}
                  y={-40}
                  width={VIEW.w + 48}
                  height={VIEW.h + 80}
                  transform={`scale(${reveal ? 0 : 1} 1)`}
                />
              </clipPath>
              <linearGradient id={`${uid}-trace`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={VIEW.w} y2={0}>
                {traceStops(geo.phase).map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>

            <GridLines steps={steps} variant={variant} />
            <g clipPath={`url(#${uid}-clip)`}>
              {geo.baselines.map((y) => (
                <line
                  key={y}
                  x1={0}
                  x2={VIEW.w}
                  y1={y}
                  y2={y}
                  stroke={isConsole ? "var(--color-line-3)" : trace}
                  strokeOpacity={isConsole ? 1 : 0.8}
                  vectorEffect="non-scaling-stroke"
                  shapeRendering="crispEdges"
                />
              ))}
              {geo.marks.map((mk) =>
                isConsole ? (
                  <rect
                    key={mk.step}
                    ref={markRef(mk.step)}
                    data-step={mk.step}
                    x={round(mk.x - mk.width / 2)}
                    y={mk.y}
                    width={mk.width}
                    height={mk.height}
                    fill={SEV[mk.sev]}
                    shapeRendering="crispEdges"
                    style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
                  />
                ) : (
                  <line
                    key={mk.step}
                    ref={markRef(mk.step)}
                    data-step={mk.step}
                    x1={mk.x}
                    x2={mk.x}
                    y1={mk.y}
                    y2={round(mk.y + mk.height)}
                    stroke={SEV[mk.sev]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "50% 50%",
                      filter: mk.sev === 4 ? "drop-shadow(0 0 6px color-mix(in oklch, var(--color-liq) 70%, transparent))" : undefined,
                    }}
                  />
                ),
              )}
              <AnimatePresence initial={false}>
                <m.path
                  key={geo.pricePath}
                  data-slot="price-path"
                  d={geo.pricePath}
                  stroke={isConsole ? trace : "var(--color-fg-3)"}
                  strokeWidth={isConsole ? 1.75 : 1.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: toSeconds(duration.slow) }}
                />
              </AnimatePresence>
            </g>
          </svg>

          {/* Stalled stretch: nothing left to liquidate profitably while the price keeps falling. */}
          {geo.phase.stall !== null && isConsole && (
            <RevealOn
              progress={progress}
              at={geo.phase.stall}
              className={cn("absolute right-0 bottom-0 border-l border-dashed border-warn/60", styles.stall)}
              style={{ left: pct(geo.phase.stall), top: pct(LANES.console.liqTop) }}
            >
              <span
                className={cn(
                  "label-mono absolute top-1.5 left-2 whitespace-nowrap text-warn",
                  hideBelow((copy.stalledTag.length * LABEL_CHAR_REM + 1) / Math.max(0.01, 1 - (geo.phase.stall ?? 1))),
                )}
              >
                {copy.stalledTag}
              </span>
            </RevealOn>
          )}

          {isConsole && (
            <>
              <RevealOn
                progress={progress}
                at={0}
                className="label-mono absolute whitespace-nowrap text-fg-2"
                style={{ left: pct(blockX(0, steps)), top: `calc(${pct(geo.pricePoints[0][1] / VIEW.h)} - 1.3rem)` }}
              >
                {values.start}
              </RevealOn>
              <RevealOn
                progress={progress}
                at={1}
                className="label-mono absolute whitespace-nowrap text-fg-1"
                style={{ right: pct(blockInset(steps)), top: `calc(${pct(geo.pricePoints[steps][1] / VIEW.h)} + 0.4rem)` }}
              >
                {values.end}
              </RevealOn>
              {facts.peak && peakMark && (
                <RevealOn
                  progress={progress}
                  at={blockX(facts.peak.step, steps)}
                  className="label-mono absolute bg-[var(--viz-surface,var(--color-elev-1))] px-1 whitespace-nowrap text-liq-hi"
                  style={{
                    left: pct(blockX(facts.peak.step, steps)),
                    bottom: `calc(${pct(1 - peakMark.y / VIEW.h)} + 0.3rem)`,
                    transform: `translateX(-${pct(blockX(facts.peak.step, steps))})`,
                  }}
                >
                  {f.usd(facts.peak.liquidated)}
                </RevealOn>
              )}
            </>
          )}

          {current !== undefined && <Playhead at={blockX(current, steps)} />}
          {drawing && <Pen progress={progress} points={geo.pricePoints} />}
        </div>
      </div>

      <div aria-hidden className={isConsole ? "h-11" : "h-3"} style={{ marginInline: inset }}>
        <TickRuler
          count={steps + 1}
          major={majorEvery(steps)}
          size={isConsole ? "md" : "sm"}
          labels={isConsole ? (i: number) => (i === 0 ? fill(copy.axisStart, { block: f.int(0) }) : f.int(i)) : undefined}
          highlight={facts.firstStep === null ? undefined : { index: facts.firstStep, tone: "liq" }}
        />
      </div>

      {onStepChange && (
        <div className="-mt-1" style={{ marginInline: inset }}>
          <Slider
            value={current ?? steps}
            onValueChange={onStepChange}
            min={0}
            max={steps}
            step={1}
            tone={point && point.liquidations > 0 ? "liq" : "calm"}
            aria-label={copy.scrubber}
            formatValue={valueText}
          />
        </div>
      )}

      {stalledNote && isConsole && (
        <p className="flex items-start gap-2 text-caption text-fg-2">
          <span aria-hidden className={cn("mt-1 inline-block size-2.5 shrink-0 rounded-[2px] border border-warn", styles.stall)} />
          {stalledNote}
        </p>
      )}
      {facts.firstStep === null && isConsole && <p className="text-caption text-fg-3">{copy.noLiquidations}</p>}

      {showTable && (
        <DataTable
          summary={copy.tableSummary}
          caption={copy.tableCaption}
          rows={timeline.points}
          rowKey={(p) => p.step}
          columns={[
            { label: copy.blockKey, numeric: true, cell: (p) => f.int(p.step) },
            { label: copy.priceKey, numeric: true, cell: (p) => f.price(p.price) },
            { label: copy.liquidatedKey, numeric: true, cell: (p) => f.usd(p.liquidated) },
            { label: copy.liquidationsKey, numeric: true, cell: (p) => f.int(p.liquidations) },
            { label: copy.wavesKey, numeric: true, cell: (p) => f.int(p.waves) },
          ]}
        />
      )}
    </figure>
  );
}

function Fact({ term, value, extra, tone }: { term: string; value: string; extra?: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="label-mono text-fg-3">{term}</dt>
      <dd className={cn("font-mono text-fg-1", tone)}>
        {value}
        {extra && <span className="ml-2 text-fg-3">{extra}</span>}
      </dd>
    </div>
  );
}

/** Colors of the trace: calm until the first liquidation, alarm while it cascades, warn once it stalls. */
function traceStops(phase: { first: number | null; stall: number | null }) {
  const calm = "var(--color-calm)";
  const liq = "var(--color-liq)";
  const warn = "var(--color-warn)";
  if (phase.first === null) {
    return [
      { offset: 0, color: calm },
      { offset: 1, color: calm },
    ];
  }
  const stops = [
    { offset: 0, color: calm },
    { offset: phase.first, color: calm },
    { offset: phase.first, color: liq },
  ];
  if (phase.stall !== null) stops.push({ offset: phase.stall, color: liq }, { offset: phase.stall, color: warn }, { offset: 1, color: warn });
  else stops.push({ offset: 1, color: liq });
  return stops;
}

function GridLines({ steps, variant }: { steps: number; variant: TimelineVariant }) {
  const every = majorEvery(steps);
  let d = "";
  for (let s = 0; s <= steps; s += every) d += `M${round(blockX(s, steps) * VIEW.w)} 0V${VIEW.h}`;
  return (
    <path d={d} stroke="var(--color-line)" strokeOpacity={variant === "trace" ? 0.6 : 1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
  );
}

/** An overlay that fades in when the needle passes its x (0–1). Visible without JavaScript (data-reveal). */
function RevealOn({
  progress,
  at,
  className,
  style,
  children,
}: {
  progress: MotionValue<number>;
  at: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const opacity = useTransform(progress, (p) => (p >= Math.min(at, 0.999) ? 1 : 0));
  return (
    <m.div aria-hidden data-reveal="" className={cn("transition-opacity duration-(--dur-base) ease-out-quart", className)} style={{ ...style, opacity }}>
      {children}
    </m.div>
  );
}

/** Playhead: a hairline at the current block; the blocks after it are dimmed. Glides between blocks. */
function Playhead({ at }: { at: number }) {
  const target = round(at * 100, 3);
  const x = useSpring(target, spring.soft);
  const reduce = useShouldReduceMotion();
  useEffect(() => {
    if (reduce) x.jump(target);
    else x.set(target);
  }, [target, reduce, x]);
  const translate = useTransform(x, (v) => `${round(v, 3)}%`);
  return (
    <m.div aria-hidden data-slot="playhead" className="pointer-events-none absolute inset-0" style={{ x: translate }}>
      <div className="absolute inset-y-0 left-0 w-full bg-bg/55" />
      <div className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-fg-1" />
    </m.div>
  );
}

/** The drawing needle: rides the reveal edge and the price path while the trace is being written. */
function Pen({ progress, points }: { progress: MotionValue<number>; points: readonly (readonly [number, number])[] }) {
  const x = useTransform(progress, (p) => `${round(p * 100, 3)}%`);
  const y = useTransform(progress, (p) => `${round(penY(points, p) * 100, 3)}%`);
  return (
    <m.div aria-hidden data-slot="pen" className="pointer-events-none absolute inset-0" style={{ x }}>
      <div className="absolute inset-y-0 left-0 w-px bg-fg-1/45" />
      <m.div className="absolute inset-0" style={{ y }}>
        <span className="absolute top-0 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-1 shadow-[0_0_12px_2px_var(--color-fg-3)]" />
      </m.div>
    </m.div>
  );
}
