"use client";

/**
 * The landing's live charts (a chunk loaded by the takeover islands of `below-fold.tsx` after the
 * reader's first intent): they bind the page's formatters (functions can't cross the server → client
 * boundary) and the live block poll. Data arrives as props from the server read; nothing here
 * fetches except `LivePulse` (eth_blockNumber every 3 s while visible). Formats and fixed props come
 * from `charts-static.tsx`, so the live markup matches the static server rendering it replaces.
 */
import { useLiveBlock } from "@/lib/chain/hooks/useLiveBlock";
import { BlockPulse } from "@/viz/block-pulse";
import { GapBars } from "@/viz/gap-bars";
import { GasGauge } from "@/viz/gas-gauge";
import { HealthDial } from "@/viz/health-dial";
import { dialProps, gapFormats, gaugeFormats, pulseProps, type FindingGapProps, type LivePulseProps, type MiniDialProps, type ScaleGaugeProps } from "./charts-static";

export function FindingGap({ locale, cleared, stuck, copy, footnote }: FindingGapProps) {
  return <GapBars cleared={cleared} stuck={stuck} copy={copy} footnote={footnote} {...gapFormats(locale)} />;
}

export function ScaleGauge({ locale, facts, copy, error }: ScaleGaugeProps) {
  return <GasGauge facts={facts} error={error} copy={copy} {...gaugeFormats(locale)} />;
}

export function LivePulse({ locale, copy }: LivePulseProps) {
  const { block, error } = useLiveBlock();
  return <BlockPulse block={block} error={error ? copy.errorTitle : undefined} copy={copy} {...pulseProps(locale)} />;
}

export function MiniDial({ locale, value, caption, copy }: MiniDialProps) {
  return <HealthDial value={value} caption={caption} copy={copy} {...dialProps(locale)} />;
}
