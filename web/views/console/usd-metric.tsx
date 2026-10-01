"use client";

import { lazy, Suspense } from "react";
import { Label } from "@/design/ui/label";
import type { MetricFormat } from "@/design/ui/metric";
import { SkeletonMetric, metricText } from "@/design/ui/skeleton";
import { toneIcon, toneSolid, toneText, type Tone } from "@/design/ui/tone";
import type { Locale } from "@/i18n/config";
import { usdParts } from "@/i18n/format";
import { cn } from "@/lib/utils";

// NumberFlow (the rolling digits) is its own chunk: the first paint does not need it.
const Metric = lazy(() => import("@/design/ui/metric").then((m) => ({ default: m.Metric })));

type Props = {
  locale: Locale;
  value: number | null;
  label: string;
  tone: Tone;
  caption?: string;
  loadingLabel: string;
  skeletonChars: number;
  /**
   * Plain text instead of NumberFlow: the number the page opened with, until the reader engages. Then
   * NumberFlow takes over with the same number, so the next result rolls from it.
   */
  still: boolean;
};

/** A hero USD metric (`Metric`, size xl): "$111.0M" rolling digit by digit when the result changes. */
export function UsdMetric({ locale, value, label, tone, caption, loadingLabel, skeletonChars, still }: Props) {
  const p = value === null ? null : usdParts(value, locale);
  const frame = <StillMetric text={p && `${p.prefix}${new Intl.NumberFormat(p.locales, p.format).format(p.value)}${p.suffix}`} label={label} tone={tone} caption={caption} loadingLabel={loadingLabel} skeletonChars={skeletonChars} />;
  if (still) return frame;
  return (
    <Suspense fallback={frame}>
      <Metric
        size="xl"
        label={label}
        tone={tone}
        caption={caption}
        loadingLabel={loadingLabel}
        skeletonChars={skeletonChars}
        value={p?.value ?? null}
        prefix={p?.prefix}
        suffix={p?.suffix}
        format={p?.format as MetricFormat | undefined}
        locales={p?.locales}
      />
    </Suspense>
  );
}

/** `Metric` (size xl) markup with the number as text: same box, same type, same tone. */
function StillMetric({ text, label, tone, caption, loadingLabel, skeletonChars }: Omit<Props, "locale" | "value" | "still"> & { text: string | null }) {
  const Icon = tone === "neutral" ? null : toneIcon[tone];
  return (
    <div data-slot="metric" data-tone={tone} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <Label as="p" className="flex items-center gap-1.5">
          {Icon && <Icon aria-hidden className={cn("size-3.5 shrink-0", toneText[tone])} />}
          {label}
        </Label>
      </div>
      <span
        data-slot="metric-value"
        aria-busy={text === null || undefined}
        className={cn("flex h-[1lh] max-w-full items-center whitespace-nowrap font-mono", metricText.xl, tone === "neutral" ? "text-fg-1" : toneSolid[tone])}
      >
        {text !== null ? (
          <>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">{text}</span>
          </>
        ) : (
          <>
            <span className="sr-only">{loadingLabel}</span>
            <SkeletonMetric size="xl" chars={skeletonChars} />
          </>
        )}
      </span>
      {caption && <p className="font-mono text-caption text-fg-3">{caption}</p>}
    </div>
  );
}
