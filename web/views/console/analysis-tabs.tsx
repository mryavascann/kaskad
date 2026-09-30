"use client";

import { TriangleAlert } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { HonestyTag } from "@/design/ui/honesty";
import { Skeleton } from "@/design/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design/ui/tabs";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { compareNotes } from "@/lib/chain/compare";
import { useCompare } from "@/lib/chain/hooks/useCompare";
import { PREVIEW_DEBOUNCE_MS } from "@/lib/chain/hooks/usePreview";
import { useStressCurve } from "@/lib/chain/hooks/useStressCurve";
import { limitFacts } from "@/lib/chain/limits";
import { compareParams, oracleMode, symbolParts } from "@/lib/chain/scenario";
import type { Result, Settings } from "@/lib/chain/types";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { curveFromChain } from "@/viz/curve-model";
import { GasGauge } from "@/viz/gas-gauge";
import { StressCurve } from "@/viz/stress-curve";
import { shockLabel } from "./model";
import { MonteCarloTab } from "./monte-carlo-tab";

/**
 * Monte Carlo, stress curve and the two-network table. Inactive tabs are unmounted (Radix), so only
 * the open tab's previews hit the RPC.
 */
export function AnalysisTabs({ locale, settings, result }: { locale: Locale; settings: Settings; result: Result | null }) {
  const t = consoleMessages[locale].tabs;
  return (
    <section aria-labelledby="analysis-title" className="flex min-w-0 flex-col gap-2">
      <h2 id="analysis-title" className="sr-only">
        {t.label}
      </h2>
      <Tabs defaultValue="mc">
        <TabsList aria-label={t.label}>
          <TabsTrigger value="mc">{t.mc}</TabsTrigger>
          <TabsTrigger value="stress">{t.stress}</TabsTrigger>
          <TabsTrigger value="networks">{t.networks}</TabsTrigger>
        </TabsList>
        <TabsContent value="mc" className="mt-8">
          <MonteCarloTab locale={locale} settings={settings} />
        </TabsContent>
        <TabsContent value="stress" className="mt-8">
          <StressTab locale={locale} settings={settings} />
        </TabsContent>
        <TabsContent value="networks" className="mt-8">
          <NetworksTab locale={locale} settings={settings} result={result} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StressTab({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = consoleMessages[locale].stress;
  const fmt = formatters(locale);
  const { curve, shocksBps } = useStressCurve(settings.assetId, settings.steps, settings.rounds, { debounceMs: PREVIEW_DEBOUNCE_MS });
  const asset = DEPLOYMENT.assets[settings.assetId];
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="flex flex-col gap-3">
        <h3 className="text-title-3 text-fg-1">{t.title}</h3>
        <p className="text-body-sm text-fg-2">{t.body({ symbol: asset ? symbolParts(asset).base : "", count: fmt.int(shocksBps.length) })}</p>
        <p className="label-mono text-fg-3">{t.free}</p>
      </div>
      <StressCurve
        data={curve ? curveFromChain(curve, shocksBps) : null}
        marker={settings.shockPct > 0 ? settings.shockPct / 100 : undefined}
        locale={INTL_LOCALE[locale]}
        formatUsd={fmt.usd}
        copy={consoleMessages[locale].charts.stress}
      />
    </div>
  );
}

const cell = "px-3 py-3 text-right font-mono text-body-sm";

function NetworksTab({ locale, settings, result }: { locale: Locale; settings: Settings; result: Result | null }) {
  const t = consoleMessages[locale].networks;
  const inputs = consoleMessages[locale].inputs;
  const fmt = formatters(locale);
  const { rows, loading } = useCompare(compareParams(settings));
  const notes = compareNotes();
  const mode = oracleMode(settings.feedback);

  const money = (v: number | undefined, hit: boolean | undefined, tone: "liq" | "warn") =>
    loading ? (
      <Skeleton className="ml-auto h-[0.8em] w-14" />
    ) : v === undefined ? (
      <span className="text-fg-3">{t.failed}</span>
    ) : (
      <span className={cn(hit ? (tone === "liq" ? "text-liq-hi" : "text-warn-hi") : "text-fg-2")}>{fmt.usd(v)}</span>
    );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <h3 className="text-title-3 text-fg-1">{t.title}</h3>
            <p className="text-body-sm text-fg-2">{t.body}</p>
          </div>
          <p className="label-mono text-fg-3">{t.params({ shock: shockLabel(settings.shockPct, fmt), oracle: consoleMessages[locale].stage.contextOracle[mode] })}</p>
        </div>

        <div className="overflow-hidden rounded-panel border border-line-2" aria-busy={loading || undefined}>
          <table className="w-full table-fixed border-collapse">
            <caption className="sr-only">{t.title}</caption>
            <thead className="bg-elev-1">
              <tr className="border-b border-line">
                <th scope="col" className="w-[34%] px-3 py-2.5 text-left label-mono font-normal text-fg-3 sm:w-[28%]">
                  {t.book}
                </th>
                <th scope="col" className="hidden px-3 py-2.5 text-right label-mono font-normal text-fg-3 md:table-cell">
                  {t.debt}
                </th>
                <th scope="col" className="hidden px-3 py-2.5 text-right label-mono font-normal text-fg-3 md:table-cell">
                  {t.depth}
                </th>
                <th scope="col" title={t.ratioHelp} className="px-3 py-2.5 text-right label-mono font-normal text-fg-3">
                  {t.ratio}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right label-mono font-normal text-fg-3">
                  {t.bad}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right label-mono font-normal text-fg-3">
                  {t.stuck}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.assetId} className={cn("border-b border-line last:border-b-0", row.assetId === settings.assetId && "bg-elev-2")}>
                  <th scope="row" className="px-3 py-3 text-left align-top font-normal">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge size="sm" mono tone={row.chain === "monad" ? "monad" : "neutral"} variant="outline" icon={null}>
                        {inputs.chain[row.chain]}
                      </Badge>
                      <span className="text-body-sm text-fg-1">{row.symbol}</span>
                    </span>
                    {row.role && <span className="mt-1 block text-caption text-fg-3">{t.roles[row.role]}</span>}
                    <span className="mt-1 block font-mono text-caption text-fg-3 md:hidden">
                      {fmt.usd(row.debtUsd)} · {fmt.usd(row.depthUsd)}
                    </span>
                  </th>
                  <td className={cn(cell, "hidden text-fg-2 md:table-cell")}>{fmt.usd(row.debtUsd)}</td>
                  <td className={cn(cell, "hidden text-fg-2 md:table-cell")}>
                    <span className="flex flex-col items-end gap-1">
                      {fmt.usd(row.depthUsd)}
                      {row.depthIsAssumption && <HonestyTag kind="assumption">{consoleMessages[locale].honesty.assumption}</HonestyTag>}
                    </span>
                  </td>
                  <td className={cn(cell, row.thinDepth ? "text-warn-hi" : "text-fg-1")}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {row.thinDepth && <TriangleAlert aria-hidden className="size-3.5" />}
                      {fmt.ratio(row.depthToDebt)}
                    </span>
                    {row.thinDepth && <span className="block text-caption">{t.thin}</span>}
                  </td>
                  <td className={cell}>{money(row.facts?.badDebtUsd, row.facts?.hasBadDebt, "liq")}</td>
                  <td className={cell}>{money(row.facts?.stuckDebtUsd, row.facts?.hasStuckDebt, "warn")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notes.usdeDepthMultiple !== null && notes.usdeDebtMultiple !== null && notes.usdcDepthToDebt !== null && (
          <p className="max-w-3xl text-caption text-fg-3">
            {t.note({ usdeDepth: fmt.ratio(notes.usdeDepthMultiple), usdeDebt: fmt.ratio(notes.usdeDebtMultiple), usdc: fmt.ratio(notes.usdcDepthToDebt) })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6 border-t border-line pt-8">
        <div className="flex max-w-2xl flex-col gap-2">
          <h3 className="text-title-3 text-fg-1">{t.gauge}</h3>
          <p className="text-body-sm text-fg-2">{t.gaugeBody}</p>
        </div>
        <GasGauge
          facts={result ? limitFacts(result) : null}
          locale={INTL_LOCALE[locale]}
          formatGas={fmt.gas}
          formatBytes={fmt.bytes}
          copy={consoleMessages[locale].charts.gauge}
        />
      </div>
    </div>
  );
}
