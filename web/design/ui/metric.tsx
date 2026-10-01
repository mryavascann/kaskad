import NumberFlow, { NumberFlowGroup, type Format, type Trend } from "@number-flow/react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cssEasing, duration, easing } from "@/motion/tokens";
import { Label } from "./label";
import { SkeletonMetric, metricText, type MetricSize } from "./skeleton";
import { toneIcon, toneSolid, toneText, type Tone } from "./tone";

// No "use client" here: NumberFlow ships its own client boundary, so Metric renders from Server
// Components too and `formatMetric` stays callable on the server.

export type { Format as MetricFormat, MetricSize };

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * The exact text a metric shows for `value`: what screen readers get, what tests assert, and what
 * server code can use for the same number elsewhere. Pure; formatters are cached per locale + format.
 */
export function formatMetric(
  value: number,
  format?: Format,
  locales: Intl.LocalesArgument = "en-US",
  { prefix = "", suffix = "" }: { prefix?: string; suffix?: string } = {},
): string {
  const key = `${JSON.stringify(locales ?? null)}|${JSON.stringify(format ?? null)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locales, format);
    formatters.set(key, formatter);
  }
  return `${prefix}${formatter.format(value)}${suffix}`;
}

/** A value a metric can show. Anything else (null, undefined, NaN, ±Infinity) renders the skeleton. */
export const isMetricValue = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Hero numbers settle like a scene (context first, then the number); small stats answer like UI.
const heroMove = { duration: duration.scene, easing: cssEasing(easing.outExpo) };
const statMove = { duration: duration.slow, easing: cssEasing(easing.outExpo) };
const fade = { duration: duration.base, easing: cssEasing(easing.outQuart) };

type ValueOptions = {
  value: number | null | undefined;
  /** `Intl.NumberFormat` options, e.g. `{ style: "currency", currency: "USD", notation: "compact" }`. */
  format?: Format;
  locales?: Intl.LocalesArgument;
  prefix?: string;
  suffix?: string;
  tone?: Tone;
  size?: MetricSize;
  /** Set false to jump instead of rolling (motion is already off under reduced motion). */
  animated?: boolean;
  /** Digit roll direction; default follows the sign of the change. */
  trend?: Trend;
  /** Skeleton width in characters while the value is missing. */
  skeletonChars?: number;
  /** Screen-reader text while the value is missing. */
  loadingLabel?: string;
};

type MetricValueProps = Omit<ComponentProps<"span">, "prefix" | "children"> & ValueOptions;

/**
 * The number line alone: one line-height tall in every state, so the skeleton and the number occupy
 * the same box. Assistive tech reads the final formatted string, never the rolling digits.
 */
export function MetricValue({
  value,
  format,
  locales = "en-US",
  prefix,
  suffix,
  tone = "neutral",
  size = "lg",
  animated = true,
  trend,
  skeletonChars,
  loadingLabel = "Loading",
  className,
  ...props
}: MetricValueProps) {
  const ready = isMetricValue(value);
  const move = size === "xl" || size === "lg" ? heroMove : statMove;
  return (
    <span
      data-slot="metric-value"
      aria-busy={ready ? undefined : true}
      className={cn(
        "flex h-[1lh] max-w-full items-center whitespace-nowrap font-mono",
        metricText[size],
        // Neutral numbers are always fg-1. Small ones are small text, so tones use the AA "-hi" color;
        // large ones take the solid mark color.
        tone === "neutral" ? "text-fg-1" : size === "sm" ? toneText[tone] : toneSolid[tone],
        className,
      )}
      {...props}
    >
      {ready ? (
        <>
          <span className="sr-only">{formatMetric(value, format, locales, { prefix, suffix })}</span>
          <NumberFlow
            // A string on purpose: React 19 writes `true` on a custom element as aria-hidden="", which
            // ARIA treats as "not hidden".
            aria-hidden="true"
            value={value}
            format={format}
            locales={locales}
            prefix={prefix}
            suffix={suffix}
            animated={animated}
            trend={trend}
            transformTiming={move}
            spinTiming={move}
            opacityTiming={fade}
          />
        </>
      ) : (
        <>
          <span className="sr-only">{loadingLabel}</span>
          <SkeletonMetric size={size} chars={skeletonChars} />
        </>
      )}
    </span>
  );
}

const gap: Record<MetricSize, string> = { xl: "gap-3", lg: "gap-2.5", md: "gap-2", sm: "gap-1.5" };

type MetricProps = Omit<ComponentProps<"div">, "prefix" | "children"> &
  ValueOptions & {
    /** Mono label above the number. */
    label?: ReactNode;
    /** Beside the label, e.g. a `<HonestyTag>` that says where the number comes from. */
    tag?: ReactNode;
    /** Line under the number: unit, count, context. */
    caption?: ReactNode;
    /** Icon before the label. Defaults to the tone icon for non-neutral tones; `null` hides it. */
    icon?: LucideIcon | null;
    /** Announce changes politely (label + value + caption) for results that update after an action. */
    announce?: boolean;
  };

/** The hero number: label, number (NumberFlow, retargets instead of restarting), caption. */
export function Metric({
  label,
  tag,
  caption,
  icon,
  announce = false,
  tone = "neutral",
  size = "lg",
  value,
  format,
  locales,
  prefix,
  suffix,
  animated,
  trend,
  skeletonChars,
  loadingLabel,
  className,
  ...props
}: MetricProps) {
  const Icon = icon === undefined ? (tone === "neutral" ? null : toneIcon[tone]) : icon;
  return (
    <div
      data-slot="metric"
      data-tone={tone}
      aria-live={announce ? "polite" : undefined}
      aria-atomic={announce ? true : undefined}
      aria-busy={announce && !isMetricValue(value) ? true : undefined}
      className={cn("flex min-w-0 flex-col", gap[size], className)}
      {...props}
    >
      {(label || tag) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          {label && (
            <Label as="p" className="flex items-center gap-1.5">
              {Icon && <Icon aria-hidden className={cn("size-3.5 shrink-0", toneText[tone])} />}
              {label}
            </Label>
          )}
          {tag}
        </div>
      )}
      <MetricValue
        value={value}
        format={format}
        locales={locales}
        prefix={prefix}
        suffix={suffix}
        tone={tone}
        size={size}
        animated={animated}
        trend={trend}
        skeletonChars={skeletonChars}
        loadingLabel={loadingLabel}
      />
      {caption && <p className="font-mono text-caption text-fg-3">{caption}</p>}
    </div>
  );
}

/** Numbers that change together (e.g. debt and collateral of one scenario) animate as one. */
export function MetricGroup({ children }: { children: ReactNode }) {
  return <NumberFlowGroup>{children}</NumberFlowGroup>;
}
