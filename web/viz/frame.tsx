import { CircleSlash, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Callout } from "@/design/ui/callout";
import { Skeleton } from "@/design/ui/skeleton";
import { cn } from "@/lib/utils";

export type ChartStatus = "ready" | "loading" | "empty" | "error";

/** What every chart shows instead of data, with its English defaults. */
export type StateCopy = {
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
};

type StateBoxProps = {
  status: Exclude<ChartStatus, "ready">;
  /** The plot box classes (height or aspect ratio): the same box as the chart, so nothing moves. */
  className?: string;
  copy: StateCopy;
  /** Error details (a string or node) under the error title. */
  error?: ReactNode;
  /** E.g. a Retry button. */
  errorAction?: ReactNode;
  emptyIcon?: LucideIcon;
};

/**
 * The chart's box while there is no chart: a skeleton (aria-busy + a text label), an empty result
 * that says what was checked, or an error. Same size as the plot in every state.
 */
export function StateBox({ status, className, copy, error, errorAction, emptyIcon: Icon = CircleSlash }: StateBoxProps) {
  if (status === "loading") {
    return (
      <div data-state="loading" aria-busy="true" className={cn("relative", className)}>
        <span className="sr-only">{copy.loading}</span>
        <Skeleton className="absolute inset-0 rounded-control" />
      </div>
    );
  }
  if (status === "empty") {
    return (
      <div
        data-state="empty"
        className={cn("relative grid place-items-center rounded-control border border-dashed border-line-2 px-4 py-3 text-center", className)}
      >
        <div className="flex max-w-sm flex-col items-center gap-1.5">
          <Icon aria-hidden className="size-5 text-fg-3" />
          <p className="text-body-sm font-medium text-fg-1">{copy.emptyTitle}</p>
          {copy.emptyBody && <p className="text-caption text-fg-3">{copy.emptyBody}</p>}
        </div>
      </div>
    );
  }
  return (
    <div data-state="error" className={cn("relative grid min-h-fit place-items-center", className)}>
      <Callout tone="liq" live="polite" title={copy.errorTitle} action={errorAction} className="w-full max-w-xl">
        {error === true ? null : error}
      </Callout>
    </div>
  );
}

/** The status a chart is in, from its data (null = still loading), an error and emptiness. */
export function chartStatus(data: unknown, error: ReactNode | undefined, empty: boolean): ChartStatus {
  if (error !== undefined && error !== null && error !== false) return "error";
  if (data === null || data === undefined) return "loading";
  return empty ? "empty" : "ready";
}
