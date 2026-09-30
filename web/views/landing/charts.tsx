"use client";

/**
 * Client wrappers for the charts the landing shows: they bind the page's formatters (functions
 * can't cross the server → client boundary) and the live block poll. Data arrives as props from the
 * server read; nothing here fetches except `LivePulse` (eth_blockNumber every 3 s while visible).
 */
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { useLiveBlock } from "@/lib/chain/hooks/useLiveBlock";
import { BlockPulse, type BlockPulseCopy } from "@/viz/block-pulse";
import { GapBars, type GapBarsCopy } from "@/viz/gap-bars";
import { GasGauge, type GasGaugeCopy } from "@/viz/gas-gauge";
import type { LimitData } from "@/viz/gauge-model";
import { HealthDial, type HealthDialCopy } from "@/viz/health-dial";

export function FindingGap({ locale, cleared, stuck, copy, footnote }: { locale: Locale; cleared: number | null; stuck: number | null; copy: GapBarsCopy; footnote?: ReactNode }) {
  const fmt = formatters(locale);
  return <GapBars cleared={cleared} stuck={stuck} copy={copy} footnote={footnote} formatUsd={fmt.usd} formatRatio={fmt.ratio} formatPct={(x) => fmt.pct(x, 2)} />;
}

export function ScaleGauge({ locale, facts, copy, error }: { locale: Locale; facts: LimitData | null; copy: GasGaugeCopy; error?: ReactNode }) {
  const fmt = formatters(locale);
  return <GasGauge facts={facts} error={error} copy={copy} formatGas={fmt.gas} formatBytes={fmt.bytes} formatInt={fmt.int} formatRatio={fmt.ratio} />;
}

export function LivePulse({ locale, copy }: { locale: Locale; copy: BlockPulseCopy }) {
  const { block, error } = useLiveBlock();
  const fmt = formatters(locale);
  return <BlockPulse block={block} error={error ? copy.errorTitle : undefined} copy={copy} formatInt={fmt.int} formatNum={(x) => fmt.num(x, 2)} cells={32} />;
}

export function MiniDial({ locale, value, caption, copy }: { locale: Locale; value: number | null; caption?: ReactNode; copy: HealthDialCopy }) {
  const fmt = formatters(locale);
  return <HealthDial value={value} caption={caption} copy={copy} formatHf={(x) => fmt.num(x, 2)} formatNum={(x) => fmt.num(x, 2)} className="w-full max-w-60" />;
}
