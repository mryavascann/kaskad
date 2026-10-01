/**
 * The landing's charts as static server HTML (server components, no client code): what the page
 * shows from the first paint, with or without JavaScript, until the takeover islands of
 * `below-fold.tsx` swap in the live charts (`charts.tsx`) after the reader's first intent. Both
 * sides take their formats and fixed props from here, so the static and the live markup match.
 */
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { BlockPulseStatic, type BlockPulseCopy } from "@/viz/block-pulse-view";
import { GapBarsStatic, type GapBarsCopy } from "@/viz/gap-bars-view";
import { GasGaugeStatic, type GasGaugeCopy } from "@/viz/gas-gauge-view";
import type { LimitData } from "@/viz/gauge-model";
import { HealthDialStatic, type HealthDialCopy } from "@/viz/health-dial-view";

export type FindingGapProps = { locale: Locale; cleared: number | null; stuck: number | null; copy: GapBarsCopy; footnote?: ReactNode };
export type ScaleGaugeProps = { locale: Locale; facts: LimitData | null; copy: GasGaugeCopy; error?: ReactNode };
export type LivePulseProps = { locale: Locale; copy: BlockPulseCopy };
export type MiniDialProps = { locale: Locale; value: number | null; caption?: ReactNode; copy: HealthDialCopy };

/** GapBars' formats in the page's locale. */
export function gapFormats(locale: Locale) {
  const fmt = formatters(locale);
  return { formatUsd: fmt.usd, formatRatio: fmt.ratio, formatPct: (x: number) => fmt.pct(x, 2) };
}

/** GasGauge's formats in the page's locale. */
export function gaugeFormats(locale: Locale) {
  const fmt = formatters(locale);
  return { formatGas: fmt.gas, formatBytes: fmt.bytes, formatInt: fmt.int, formatRatio: fmt.ratio };
}

/** BlockPulse's formats in the page's locale, and its fixed props. */
export function pulseProps(locale: Locale) {
  const fmt = formatters(locale);
  return { formatInt: fmt.int, formatNum: (x: number) => fmt.num(x, 2), cells: 32 };
}

/** HealthDial's formats in the page's locale, and its fixed props. */
export function dialProps(locale: Locale) {
  const fmt = formatters(locale);
  return { formatHf: (x: number) => fmt.num(x, 3), formatNum: (x: number) => fmt.num(x, 2), className: "w-full max-w-60" };
}

export function FindingGapStatic({ locale, cleared, stuck, copy, footnote }: FindingGapProps) {
  return <GapBarsStatic cleared={cleared} stuck={stuck} copy={copy} footnote={footnote} {...gapFormats(locale)} />;
}

export function ScaleGaugeStatic({ locale, facts, copy, error }: ScaleGaugeProps) {
  return <GasGaugeStatic facts={facts} error={error} copy={copy} {...gaugeFormats(locale)} />;
}

/** The block strip before its first read (the server does not poll): waiting for a block. */
export function LivePulseStatic({ locale, copy }: LivePulseProps) {
  return <BlockPulseStatic block={null} copy={copy} {...pulseProps(locale)} />;
}

export function MiniDialStatic({ locale, value, caption, copy }: MiniDialProps) {
  return <HealthDialStatic value={value} caption={caption} copy={copy} {...dialProps(locale)} />;
}
