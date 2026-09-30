import { ArrowUpRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonMetric } from "./skeleton";
import { toneSolid, toneText, type Tone } from "./tone";

type ReadoutProps = ComponentProps<"dl"> & {
  /** Pad rows to sit flush inside a Panel (default). `false` for a bare list inside other content. */
  inset?: boolean;
};

/** Instrument readout: key on the left, value on the right, 1px rules between rows. */
export function Readout({ inset = true, className, ...props }: ReadoutProps) {
  return (
    <dl
      data-slot="readout"
      data-inset={inset}
      className={cn("group/readout flex min-w-0 flex-col divide-y divide-line", className)}
      {...props}
    />
  );
}

type ReadoutRowProps = Omit<ComponentProps<"div">, "children"> & {
  label: ReactNode;
  /** Already formatted value. `null` / `undefined` = not arrived yet: a skeleton, never "0" or "—". */
  value: ReactNode;
  tone?: Tone;
  /** External proof link (explorer, source). Opens in a new tab. */
  href?: string;
  /** The big number of the readout: label on top, metric-size value, optional caption. */
  emphasis?: boolean;
  /** Small print under the value (emphasis rows) or under the row. */
  caption?: ReactNode;
  /** Skeleton width in characters. */
  skeletonChars?: number;
  /** Screen-reader text while the value is missing. */
  loadingLabel?: string;
  /** Screen-reader hint appended to external links. */
  newTabLabel?: string;
};

export function ReadoutRow({
  label,
  value,
  tone = "neutral",
  href,
  emphasis = false,
  caption,
  skeletonChars,
  loadingLabel = "Loading",
  newTabLabel = "opens in a new tab",
  className,
  ...props
}: ReadoutRowProps) {
  const loading = value === null || value === undefined;

  let content: ReactNode;
  if (loading) {
    content = (
      <>
        <span className="sr-only">{loadingLabel}</span>
        {emphasis ? (
          <SkeletonMetric size="lg" chars={skeletonChars ?? 6} />
        ) : (
          <Skeleton className="h-[0.8em] max-w-full" style={{ width: `${skeletonChars ?? 8}ch` }} />
        )}
      </>
    );
  } else if (href) {
    content = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group/link inline-flex max-w-full items-center gap-1 rounded-tag underline decoration-line-3 underline-offset-4",
          "transition-[text-decoration-color] duration-(--dur-fast) ease-out-quart hover:decoration-current",
        )}
      >
        <span className="min-w-0 truncate">{value}</span>
        <ArrowUpRight
          aria-hidden
          className="size-3.5 shrink-0 transition-[translate] duration-(--dur-fast) ease-out-quart group-hover/link:translate-x-px group-hover/link:-translate-y-px"
        />
        {/* Comma, not a leading space: whitespace at the start of an sr-only box is collapsed. */}
        <span className="sr-only">, {newTabLabel}</span>
      </a>
    );
  } else {
    content = value;
  }

  if (emphasis) {
    return (
      <div
        data-slot="readout-row"
        data-emphasis=""
        className={cn("flex min-w-0 flex-col gap-3 py-5 group-data-[inset=true]/readout:px-5", className)}
        {...props}
      >
        <dt className="label-mono text-fg-3">{label}</dt>
        <dd
          aria-busy={loading || undefined}
          className={cn("flex h-[1lh] min-w-0 items-center font-mono text-metric-lg", toneSolid[tone])}
        >
          {content}
        </dd>
        {caption && <dd className="font-mono text-caption text-fg-2">{caption}</dd>}
      </div>
    );
  }

  return (
    <div
      data-slot="readout-row"
      className={cn(
        "flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 group-data-[inset=true]/readout:px-5",
        className,
      )}
      {...props}
    >
      <dt className="label-mono shrink-0 text-fg-3">{label}</dt>
      <dd
        aria-busy={loading || undefined}
        className={cn(
          "ml-auto flex min-w-0 max-w-full justify-end text-right font-mono text-body-sm font-medium",
          tone === "neutral" ? "text-fg-1" : toneText[tone],
        )}
      >
        {content}
      </dd>
      {caption && <dd className="basis-full text-right text-caption text-fg-3">{caption}</dd>}
    </div>
  );
}
