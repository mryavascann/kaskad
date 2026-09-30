"use client";

import { OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SkeletonMetric } from "@/design/ui/skeleton";
import { toneText, type Tone } from "@/design/ui/tone";
import { cn } from "@/lib/utils";
import { useShouldReduceMotion } from "@/motion/hooks";
import { spring } from "@/motion/tokens";
import { fill, mergeCopy } from "./copy";
import { withFormats, type Formatter } from "./format";
import { HF_TARGET, hfAngle, hfStops, hfZone, type HfZone } from "./gauge-model";
import { arcPath, pct, polar, round } from "./geometry";

export type HealthDialCopy = {
  label: string;
  liquidatable: string;
  warning: string;
  safe: string;
  noDebt: string;
  loading: string;
  zones: string;
};

export const HEALTH_DIAL_COPY: HealthDialCopy = {
  label: "Health factor",
  liquidatable: "Liquidatable",
  warning: "Warning",
  safe: "Safe",
  noDebt: "No debt",
  loading: "Loading the health factor",
  zones: "Liquidatable under {one}, warning under {target}.",
};

type HealthDialProps = {
  /** Health factor. null: not arrived yet (skeleton). Infinity: no debt. */
  value: number | null;
  /** Upper edge of the warning zone (default 1.05, the wallet page's safety target). */
  target?: number;
  /** Small print under the readout, e.g. which position and which block. */
  caption?: ReactNode;
  locale?: string;
  formatHf?: Formatter;
  formatNum?: Formatter;
  copy?: Partial<HealthDialCopy>;
  className?: string;
  id?: string;
};

const W = 240;
const H = 146;
const CX = 120;
const CY = 122;
const R = 100;
const REST = -90;

const ZONE: Record<HfZone, { tone: Tone; icon: LucideIcon; stroke: string }> = {
  liquidatable: { tone: "liq", icon: OctagonAlert, stroke: "var(--color-liq)" },
  warning: { tone: "warn", icon: TriangleAlert, stroke: "var(--color-warn)" },
  safe: { tone: "safe", icon: ShieldCheck, stroke: "var(--color-safe)" },
};

/**
 * Half-circle health-factor gauge: liquidatable under 1, warning up to the target, safe above, on a
 * zone-weighted scale whose ticks carry the real values. The needle is a `spring.needle`: it trembles,
 * then settles, and a new value retargets it mid-swing. `null` → skeleton, `Infinity` → "no debt".
 */
export function HealthDial({ value, target = HF_TARGET, caption, locale, formatHf, formatNum, copy: copyProp, className, id }: HealthDialProps) {
  const copy = mergeCopy(HEALTH_DIAL_COPY, copyProp);
  const f = withFormats(locale, { hf: formatHf, num: formatNum });
  const loading = value === null || Number.isNaN(value);
  const noDebt = value !== null && value === Infinity;
  const angleFor = (v: number | null) => (v === null || Number.isNaN(v) ? REST : v === Infinity ? 90 : hfAngle(v, target));
  const targetAngle = angleFor(value);

  const reduce = useShouldReduceMotion();
  const angle = useMotionValue(targetAngle);
  // The attribute React renders once; afterwards the motion value owns the needle's rotation.
  const [initialAngle] = useState(targetAngle);
  const needleRef = useRef<SVGGElement>(null);
  const shown = useRef(value);
  useMotionValueEvent(angle, "change", (a) => needleRef.current?.setAttribute("transform", `rotate(${round(a, 3)} ${CX} ${CY})`));
  useEffect(() => {
    const previous = shown.current;
    shown.current = value;
    if (previous === value) return;
    // A value that arrives after loading swings in from rest; a changed value retargets mid-swing.
    if (reduce) {
      angle.jump(targetAngle);
      return;
    }
    if (previous === null) angle.jump(REST);
    const controls = animate(angle, targetAngle, spring.needle);
    return () => controls.stop();
  }, [value, targetAngle, reduce, angle]);

  const { domain, unit } = hfStops(target);
  const zone = !loading && !noDebt && value !== null ? hfZone(value, target) : null;
  const ZoneIcon = zone ? ZONE[zone].icon : ShieldCheck;
  const arc = (from: number, to: number) => arcPath(CX, CY, R, -90 + 180 * from, -90 + 180 * to);
  const zones: [HfZone, number, number][] = [
    ["liquidatable", unit[0], unit[1]],
    ["warning", unit[1], unit[2]],
    ["safe", unit[2], unit[4]],
  ];
  const zoneWord = zone ? copy[zone] : noDebt ? copy.noDebt : "";

  return (
    <figure
      id={id}
      data-slot="health-dial"
      data-zone={zone ?? (noDebt ? "none" : undefined)}
      aria-label={copy.label}
      aria-busy={loading || undefined}
      className={cn("flex w-full max-w-[20rem] min-w-0 flex-col items-center gap-3", className)}
    >
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block size-full overflow-visible" fill="none">
          <path d={arc(0, 1)} stroke="var(--color-line-2)" strokeWidth={1} />
          {zones.map(([z, from, to]) => (
            <path
              key={z}
              d={arc(from + (from > 0 ? 0.006 : 0), to - (to < 1 ? 0.006 : 0))}
              stroke={ZONE[z].stroke}
              strokeOpacity={loading ? 0.25 : zone === z ? 1 : 0.4}
              strokeWidth={zone === z ? 8 : 6}
              className="transition-[stroke-opacity] duration-(--dur-base) ease-out-quart"
            />
          ))}
          {domain.map((d, i) => {
            const a = -90 + 180 * unit[i];
            const [x1, y1] = polar(CX, CY, R - 10, a);
            const [x2, y2] = polar(CX, CY, R + 5, a);
            return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-fg-3)" strokeWidth={1} />;
          })}
          {!loading && !noDebt && (
            <g ref={needleRef} data-slot="needle" transform={`rotate(${initialAngle} ${CX} ${CY})`}>
              <line x1={CX} y1={CY + 10} x2={CX} y2={CY - R + 16} stroke="var(--color-fg-1)" strokeWidth={2} strokeLinecap="round" />
            </g>
          )}
          <circle cx={CX} cy={CY} r={5} fill="var(--color-elev-3)" stroke="var(--color-fg-2)" strokeWidth={1.25} />
        </svg>
        {domain.map((d, i) => {
          // The two ends sit under the arc ends (inside the box); the others just outside the arc.
          const end = i === 0 || i === domain.length - 1;
          const [px, py] = polar(CX, CY, end ? R : R + 17, -90 + 180 * unit[i]);
          const [x, y] = end ? [px, py + 16] : [px, py];
          return (
            <span
              key={d}
              aria-hidden
              className="label-mono absolute -translate-x-1/2 -translate-y-1/2 text-fg-3"
              style={{ left: pct(x / W), top: pct(y / H) }}
            >
              {i === domain.length - 1 ? `${f.num(d)}+` : f.num(d)}
            </span>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1.5 text-center">
        {loading ? (
          <>
            <span className="sr-only">{copy.loading}</span>
            <SkeletonMetric size="md" chars={5} />
          </>
        ) : (
          <p className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <span className="font-mono text-metric-md text-fg-1">{noDebt ? "∞" : f.hf(value ?? 0)}</span>
            <span className={cn("inline-flex items-center gap-1.5 text-body-sm font-medium", zone ? toneText[ZONE[zone].tone] : "text-calm-hi")}>
              <ZoneIcon aria-hidden className="size-4" />
              {zoneWord}
            </span>
          </p>
        )}
        <figcaption className="text-caption text-fg-3">
          {caption}
          <span className="sr-only"> {fill(copy.zones, { one: f.num(1), target: f.num(target) })}</span>
        </figcaption>
      </div>
    </figure>
  );
}
