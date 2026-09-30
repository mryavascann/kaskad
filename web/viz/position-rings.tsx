"use client";

import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useShouldReduceMotion } from "@/motion/hooks";
import { duration, easing, spring, stagger, toSeconds } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { withFormats } from "./format";
import { StateBox, chartStatus } from "./frame";
import { pct, round } from "./geometry";
import { StateLegend, stateLabel } from "./outcome";
import { PositionsTable, POSITIONS_COPY, type PositionsCopy, type PositionsFormatProps, type PositionsInput } from "./position-tiles";
import { atEnd, byThreshold, dropAt, flipRanks, stateCounts, tileState, visibleStates, type Replay, type TileState } from "./positions";
import { RINGS_VIEW, R_BEYOND, R_CENTER, R_MAX, dropRadius, ringsGeometry } from "./rings-model";
import { useEnterView } from "./use-enter-view";
import styles from "./viz.module.css";

export type PositionRingsCopy = PositionsCopy & {
  ringsLabel: string;
  ringsSummary: string;
  ringsNote: string;
  beyond: string;
  shockTag: string;
  frontTag: string;
};

export const POSITION_RINGS_COPY: PositionRingsCopy = {
  ...POSITIONS_COPY,
  ringsLabel: "Positions by distance to liquidation",
  ringsSummary:
    "{total} positions, each placed by the price drop that makes it liquidatable and sized by its debt. The shock ring is at {drop}; {inside} positions are inside it.",
  ringsNote: "Distance from the center: price drop to liquidation. Dot area: debt.",
  beyond: "Beyond {max}",
  shockTag: "Shock {drop}",
  frontTag: "Shock front {drop}",
};

type PositionRingsProps = Replay &
  PositionsFormatProps & {
    classification: PositionsInput | null;
    /** The scenario's shock as a fraction (0.03 = −3 %): the ring the front expands to. */
    shock: number | null;
    /** In the middle; defaults to the current price drop. */
    centerLabel?: ReactNode;
    table?: boolean;
    error?: ReactNode;
    errorAction?: ReactNode;
    formatChange?: (value: number) => string;
    formatPctTick?: (value: number) => string;
    copy?: Partial<PositionRingsCopy>;
    className?: string;
    id?: string;
  };

const BOX = "relative mx-auto aspect-square w-full max-w-[32rem]";

/**
 * The epicenter view: every position is a dot on rings of "price drop to liquidation", sized by debt,
 * patterned by state. The shock front expands to the scenario's shock (or to the replay's current
 * drop) and the dots it reaches flip. Deterministic layout (golden angle by book index), rounded.
 */
export function PositionRings({
  classification,
  shock,
  step,
  steps,
  prices,
  centerLabel,
  table = true,
  error,
  errorAction,
  locale,
  formatUsd,
  formatPct,
  formatHf,
  formatInt,
  formatChange,
  formatPctTick,
  copy: copyProp,
  className,
  id,
}: PositionRingsProps) {
  const copy = mergeCopy(POSITION_RINGS_COPY, copyProp);
  const f = withFormats(locale, { usd: formatUsd, pct: formatPct, hf: formatHf, int: formatInt, change: formatChange, pctTick: formatPctTick });
  const mismatch = classification && !classification.consistent;
  const positions = useMemo(() => (classification?.consistent ? classification.positions : []), [classification]);
  const status = mismatch ? "error" : chartStatus(classification && shock !== null ? classification : null, error, positions.length === 0);

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const geo = useMemo(() => ringsGeometry(positions, shock ?? 0), [positions, shock]);
  const replay: Replay = { step, steps, prices };
  const drop = dropAt(replay) ?? shock ?? 0;
  const frontScale = round(dropRadius(drop, geo.maxDrop) / R_MAX, 4);

  // The shock front: a circle of radius R_MAX scaled to the current drop. Expands from the center
  // when the chart scrolls into view; follows the replay with a spring (retargets, never restarts).
  const boxRef = useRef<HTMLDivElement>(null);
  const entered = useEnterView(boxRef);
  const reduce = useShouldReduceMotion();
  const scale = useMotionValue(frontScale);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (reduce) {
      scale.jump(frontScale);
      return;
    }
    const controls = animate(scale, frontScale, spring.soft);
    return () => controls.stop();
  }, [frontScale, reduce, scale]);
  useEffect(() => {
    // Plays once, when the chart enters the view; later changes retarget above.
    if (!entered || reduce) return;
    const target = scale.get();
    scale.jump(R_CENTER / R_MAX);
    const controls = animate(scale, target, { duration: toSeconds(duration.scene), ease: easing.outExpo });
    return () => controls.stop();
  }, [entered, reduce, scale]);

  if (status !== "ready") {
    return (
      <figure id={id} data-slot="position-rings" aria-label={copy.ringsLabel} className={cn("flex min-w-0 flex-col gap-4", className)}>
        <StateBox
          status={status}
          className={BOX}
          copy={mismatch ? { ...copy, errorTitle: copy.mismatchTitle } : copy}
          error={mismatch ? copy.mismatchBody : error}
          errorAction={errorAction}
        />
        <div aria-hidden className="min-h-[1lh] text-caption" />
      </figure>
    );
  }

  const ordered = byThreshold(positions);
  const stateOf = new Map<number, TileState>(ordered.map((p) => [p.index, tileState(p, replay)]));
  const ranks = flipRanks(ordered, ordered.map((p) => stateOf.get(p.index) ?? "pending"), replay);
  const rankOf = new Map(ordered.map((p, i) => [p.index, ranks[i]]));
  const counts = stateCounts(positions, replay);
  const inside = positions.filter((p) => p.thresholdDrop !== null && p.thresholdDrop <= drop).length;
  const total = f.int(positions.length);
  const countsSentence = atEnd(replay)
    ? fill(copy.summaryEnd, { total, badDebt: f.int(counts["bad-debt"]), stuck: f.int(counts.stuck), liquidated: f.int(counts.liquidated), safe: f.int(counts.safe) })
    : fill(copy.summaryStep, {
        total,
        block: f.int(step ?? 0),
        steps: f.int(steps ?? 0),
        liquidated: f.int(counts.liquidated),
        below: f.int(counts.below),
        pending: f.int(counts.pending),
      });
  const summary = `${fill(copy.ringsSummary, { total, drop: f.change(-drop), inside: f.int(inside) })} ${countsSentence}`;
  const legend = visibleStates(replay, Boolean(prices?.length)).map((state) => ({ state, label: stateLabel(copy, state), count: f.int(counts[state]) }));
  const C = RINGS_VIEW / 2;
  const shockR = dropRadius(shock ?? 0, geo.maxDrop);

  return (
    <figure id={id} data-slot="position-rings" aria-label={copy.ringsLabel} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div ref={boxRef} role="img" aria-label={summary} className={BOX}>
        <svg aria-hidden viewBox={`0 0 ${RINGS_VIEW} ${RINGS_VIEW}`} className="absolute inset-0 block size-full overflow-visible">
          <defs>
            <pattern id={`${uid}-hatch`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={4} height={4} style={{ fill: "color-mix(in oklch, var(--color-warn) 14%, transparent)" }} />
              <line x1={0} y1={0} x2={0} y2={4} style={{ stroke: "var(--color-warn)" }} strokeWidth={1.6} />
            </pattern>
            <pattern id={`${uid}-cross`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={4} height={4} style={{ fill: "color-mix(in oklch, var(--color-liq) 22%, transparent)" }} />
              <path d="M0 0V4M0 0H4" style={{ stroke: "var(--color-liq)" }} strokeWidth={1.4} />
            </pattern>
            <radialGradient id={`${uid}-glow`}>
              <stop offset="0%" style={{ stopColor: "var(--color-liq)", stopOpacity: 0.16 }} />
              <stop offset="100%" style={{ stopColor: "var(--color-liq)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>

          {/* Distance rings, the outer "beyond" band, the final shock (dashed). */}
          {geo.rings.map(({ drop: d, r }) => (
            <circle key={d} cx={C} cy={C} r={r} fill="none" stroke="var(--color-line-2)" vectorEffect="non-scaling-stroke" />
          ))}
          <circle cx={C} cy={C} r={R_BEYOND} fill="none" stroke="var(--color-line-2)" strokeDasharray="1 5" vectorEffect="non-scaling-stroke" />
          <circle cx={C} cy={C} r={shockR} fill="none" stroke="var(--color-liq)" strokeOpacity={0.55} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />

          {/* The shock front. */}
          <motion.g style={{ scale, transformBox: "fill-box", transformOrigin: "50% 50%" }}>
            <circle cx={C} cy={C} r={R_MAX} style={{ fill: `url(#${uid}-glow)` }} />
            <circle cx={C} cy={C} r={R_MAX} fill="none" stroke="var(--color-liq)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </motion.g>

          {geo.dots.map((dot) => {
            const state = stateOf.get(dot.index) ?? "pending";
            return (
              <circle
                key={`${dot.index}-${state}`}
                data-state={state}
                cx={dot.cx}
                cy={dot.cy}
                r={dot.r}
                className={styles.pop}
                vectorEffect="non-scaling-stroke"
                strokeWidth={1.25}
                style={{ ...dotStyle(state, uid), "--flip-delay": `${(rankOf.get(dot.index) ?? 0) * stagger.tight}ms` } as CSSProperties}
              />
            );
          })}
          <circle cx={C} cy={C} r={3} style={{ fill: "var(--color-fg-1)" }} />
        </svg>

        {/* Ring labels in the dot-free lane at 12 o'clock, the current drop in the middle. */}
        {geo.rings.map(({ drop: d, r }) => (
          <span
            key={d}
            aria-hidden
            className="label-mono absolute -translate-x-1/2 -translate-y-1/2 bg-[var(--viz-surface,var(--color-elev-1))] px-1 text-fg-3"
            style={{ left: "50%", top: pct((C - r) / RINGS_VIEW) }}
          >
            {f.pctTick(d)}
          </span>
        ))}
        <span
          aria-hidden
          className="label-mono absolute -translate-x-1/2 -translate-y-1/2 bg-[var(--viz-surface,var(--color-elev-1))] px-1 whitespace-nowrap text-fg-3"
          style={{ left: "50%", top: pct((C - R_BEYOND) / RINGS_VIEW) }}
        >
          {fill(copy.beyond, { max: f.pctTick(geo.maxDrop) })}
        </span>
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 translate-x-3 -translate-y-1/2 font-mono text-caption whitespace-nowrap text-fg-1"
        >
          {centerLabel ?? f.change(-drop)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <StateLegend items={legend} />
        <ul aria-hidden className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-caption text-fg-2">
          {Math.abs(drop - (shock ?? 0)) > 1e-4 && (
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-full border border-liq" />
              {fill(copy.frontTag, { drop: f.change(-drop) })}
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className={cn("size-3 rounded-full border border-liq", Math.abs(drop - (shock ?? 0)) > 1e-4 && "border-dashed")} />
            {fill(copy.shockTag, { drop: f.change(-(shock ?? 0)) })}
          </li>
        </ul>
        <p className="text-caption text-fg-3">{copy.ringsNote}</p>
      </div>
      {table && <PositionsTable positions={ordered} copy={copy} f={f} />}
    </figure>
  );
}

function dotStyle(state: TileState, uid: string): CSSProperties {
  switch (state) {
    case "bad-debt":
      return { fill: `url(#${uid}-cross)`, stroke: "var(--color-liq)" };
    case "stuck":
      return { fill: `url(#${uid}-hatch)`, stroke: "var(--color-warn)" };
    case "liquidated":
      return { fill: "var(--color-sev-3)", stroke: "var(--color-sev-3)" };
    case "below":
      return { fill: "color-mix(in oklch, var(--color-warn) 10%, transparent)", stroke: "var(--color-warn)", strokeDasharray: "2 2" };
    case "safe":
      return { fill: "color-mix(in oklch, var(--color-calm) 22%, transparent)", stroke: "var(--color-calm)" };
    default:
      return { fill: "var(--color-bg)", stroke: "var(--color-line-strong)" };
  }
}
