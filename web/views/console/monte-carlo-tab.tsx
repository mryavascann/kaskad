"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Skeleton } from "@/design/ui/skeleton";
import { Slider } from "@/design/ui/slider";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { proveMonteCarlo, proveMonteCarloGasLimit, type ProveMonteCarloOutcome } from "@/lib/chain/actions/proveMonteCarlo";
import { MC_DEFAULT_PATHS, MC_MAX_SHOCK_MULTIPLE, MC_SLIDER_MAX } from "@/lib/chain/engine";
import { useMonteCarlo } from "@/lib/chain/hooks/useMonteCarlo";
import { MONAD_MEMORY_LIMIT, MONAD_TX_GAS_LIMIT } from "@/lib/chain/limits";
import { monteCarloBase } from "@/lib/chain/scenario";
import type { Settings } from "@/lib/chain/types";
import { MonteCarloChart } from "@/viz/monte-carlo-chart";
import { CostLine, TxProgress, useConfirmCost, useTxFlow } from "../shared/tx/tx-parts";
import { shockLabel } from "./model";

/** K random price paths on the real book in one call, the free "find the limit" search and the proof. */
export function MonteCarloTab({ locale, settings }: { locale: Locale; settings: Settings }) {
  const t = consoleMessages[locale].mc;
  const fmt = formatters(locale);
  const base = monteCarloBase(settings);
  const [paths, setPaths] = useState(MC_DEFAULT_PATHS);
  const mc = useMonteCarlo(base, paths);
  const flow = useTxFlow<ProveMonteCarloOutcome>();
  const { confirm, dialog } = useConfirmCost(locale);
  const max = mc.limit ? Math.max(1, mc.limit.k) : MC_SLIDER_MAX;
  const limitGas = fmt.gas(MONAD_TX_GAS_LIMIT);

  if (!mc.available) return <Callout tone="neutral" title={t.unavailable} />;

  const prove = async () => {
    if (!mc.result) return;
    flow.start(["send", "confirm"]);
    flow.finish(await proveMonteCarlo(base, paths, mc.result, { onEvent: flow.onEvent, confirm }));
  };
  const f = mc.facts;
  const proved = flow.outcome?.status === "confirmed" ? flow.outcome : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-title-3 text-fg-1">{t.title}</h3>
          <p className="text-body-sm text-fg-2">
            {t.body({ mean: shockLabel(settings.shockPct, fmt).replace(/^[−-]/, ""), multiple: fmt.int(MC_MAX_SHOCK_MULTIPLE) })}
          </p>
        </div>
        <Slider
          label={t.k}
          showValue
          value={Math.min(paths, max)}
          onValueChange={setPaths}
          min={1}
          max={max}
          tone="monad"
          formatValue={(v) => fmt.int(v)}
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" loading={mc.searching} onClick={() => void mc.findLimit()}>
              <Search aria-hidden />
              {t.findLimit}
            </Button>
            {mc.limit && (
              <Button size="sm" variant="ghost" onClick={() => setPaths(Math.max(1, mc.limit?.k ?? 1))}>
                {t.useLimit}
              </Button>
            )}
          </div>
          {mc.limit ? (
            <p className="text-body-sm text-fg-1" role="status">
              {t.limit({ k: fmt.int(mc.limit.k), limit: limitGas })} <span className="text-caption text-fg-3">· {t.limitNote}</span>
            </p>
          ) : (
            <CostLine free locale={locale} />
          )}
        </div>
        {mc.fits === false && <Callout tone="warn" title={t.tooLarge({ limit: limitGas })} />}
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line-2 bg-line sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {(
            [
              [t.gas, f ? t.gasValue({ gas: fmt.gas(f.gasUsed), limit: limitGas }) : null],
              [t.memory, f ? t.gasValue({ gas: fmt.bytes(f.memoryBytes), limit: fmt.bytes(MONAD_MEMORY_LIMIT) }) : null],
              [t.scenarios, f ? t.scenariosValue({ paths: fmt.int(f.paths), positions: fmt.int(f.positionsUsed), total: fmt.int(f.positionScenarios) }) : null],
            ] as [string, string | null][]
          ).map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1 bg-elev-1 px-4 py-3">
              <dt>
                <Label>{label}</Label>
              </dt>
              <dd aria-busy={value === null || undefined} className="min-h-[1lh] font-mono text-body-sm text-fg-1">
                {value ?? <Skeleton className="mt-[0.3em] h-[0.8em] w-24" />}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-fg-3">{t.memoryNote}</p>
        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <Button variant="secondary" loading={flow.busy} disabled={!mc.result || mc.loading || flow.busy} onClick={prove} className="self-start">
            {t.prove}
            <ArrowUpRight aria-hidden />
          </Button>
          <CostLine gasLimit={mc.result ? proveMonteCarloGasLimit(mc.result) : null} locale={locale} />
          <TxProgress flow={flow.flow} outcome={flow.outcome} locale={locale} />
          {proved && <p className="text-caption text-safe">{t.proved({ paths: fmt.int(proved.paths) })}</p>}
        </div>
      </div>
      <MonteCarloChart
        facts={f}
        error={mc.fits === false ? t.tooLarge({ limit: limitGas }) : undefined}
        locale={INTL_LOCALE[locale]}
        formatUsd={fmt.usd}
        copy={consoleMessages[locale].charts.mc}
        className="min-w-0"
      />
      {dialog}
    </div>
  );
}
