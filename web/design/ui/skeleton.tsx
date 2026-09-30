import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Metric sizes shared by `Metric`, `MetricValue` and `SkeletonMetric` (kept here so server code can import it). */
export const metricText = {
  xl: "text-metric-xl",
  lg: "text-metric-lg",
  md: "text-metric-md",
  sm: "text-metric-sm",
} as const;

export type MetricSize = keyof typeof metricText;

/**
 * Sweep highlight. Painted and animated only when motion is allowed, so reduced motion shows a still
 * block (the information, "loading", stays: callers set `aria-busy` and a text label).
 */
const shimmer = [
  "motion-safe:animate-shimmer motion-safe:bg-no-repeat motion-safe:bg-[length:200%_100%]",
  "motion-safe:bg-linear-to-r motion-safe:from-transparent motion-safe:from-30% motion-safe:via-line motion-safe:to-transparent motion-safe:to-70%",
].join(" ");

/**
 * Placeholder block for data that has not arrived. Always decorative: the loading state is announced
 * by the region that owns it (`aria-busy` + a text label), never by the skeleton itself.
 * A `span` so it is valid inside `<p>`, `<dd>` and buttons; size it with classes.
 */
export function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return <span aria-hidden data-slot="skeleton" className={cn("block rounded-tag bg-line", shimmer, className)} {...props} />;
}

type SkeletonTextProps = ComponentProps<"span"> & {
  /** Number of lines; the last one is shorter. */
  lines?: number;
};

/**
 * Lines of text. Each line is exactly one line-height tall, so it inherits the type style it replaces
 * (`<SkeletonText className="text-body-sm" />`) and the text lands without a layout shift.
 */
export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <span aria-hidden data-slot="skeleton-text" className={cn("flex w-full flex-col", className)} {...props}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <span key={i} className="flex h-[1lh] items-center">
          <Skeleton className={cn("h-[0.62em] w-full", lines > 1 && i === lines - 1 && "w-3/5")} />
        </span>
      ))}
    </span>
  );
}

type SkeletonMetricProps = ComponentProps<"span"> & {
  size?: MetricSize;
  /** Expected width in characters of the formatted number (Geist Mono is fixed-width). */
  chars?: number;
};

/** A metric that has not arrived: same font size and line box as `MetricValue`, so nothing moves when it lands. */
export function SkeletonMetric({ size = "lg", chars = 6, className, ...props }: SkeletonMetricProps) {
  return (
    <span
      aria-hidden
      data-slot="skeleton-metric"
      className={cn("flex h-[1lh] w-fit max-w-full items-center font-mono", metricText[size], className)}
      {...props}
    >
      <Skeleton className="h-[0.7em] max-w-full" style={{ width: `${chars}ch` }} />
    </span>
  );
}
