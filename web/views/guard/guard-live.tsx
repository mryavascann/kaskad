"use client";

import { ArrowUpRight, Lock, LockOpen, ShieldAlert } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/design/ui/panel";
import { Readout, ReadoutRow } from "@/design/ui/readout";
import { Skeleton } from "@/design/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { guardMessages } from "@/i18n/messages/guard";
import { borrow, type BorrowOutcome } from "@/lib/chain/actions/borrow";
import { runGuard, type RunGuardOutcome } from "@/lib/chain/actions/runGuard";
import { BORROW_AMOUNT, BORROW_GAS, MARKETS, type MarketId } from "@/lib/chain/guard";
import { useGuardConfig } from "@/lib/chain/hooks/useGuardConfig";
import { useGuardMarkets } from "@/lib/chain/hooks/useGuardMarkets";
import { symbolParts } from "@/lib/chain/scenario";
import type { MarketState } from "@/lib/chain/types";
import { addrUrl, DEPLOYMENT } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";
import { PanelHeading } from "../shared/panel-heading";
import { CostLine, TxProgress, useConfirmCost, useTxFlow } from "../shared/tx/tx-parts";
import { Breaker } from "./breaker";

const UNITS = Number(BORROW_AMOUNT / 10n ** 18n);

function MarketCard({ id, market, locale, onChange }: { id: MarketId; market: MarketState | null; locale: Locale; onChange: () => void }) {
  const t = guardMessages[locale].markets;
  const fmt = formatters(locale);
  const flow = useTxFlow<BorrowOutcome>();
  const guarded = MARKETS[id].guarded;
  const paused = market?.paused ?? false;
  const blocked = flow.flow?.error === "borrow-paused";

  const tryBorrow = async () => {
    flow.start(["check", "send", "confirm"]);
    // The free pre-check fails with a "failed" event (borrow-paused); when it passes, the first send
    // event marks it done.
    const out = await borrow(MARKETS[id].address, { onEvent: flow.onEvent });
    flow.finish(out);
    onChange();
  };

  return (
    <Panel as="article" aria-labelledby={`market-${id}-title`} tone={paused ? "liq" : undefined} className="flex flex-col">
      <PanelHeader
        title={<span id={`market-${id}-title`}>{t[id].name}</span>}
        actions={
          market === null ? (
            <Skeleton className="h-5 w-28" />
          ) : paused ? (
            <Badge tone="liq" variant="solid" mono size="sm" icon={Lock}>
              {t.paused}
            </Badge>
          ) : (
            <Badge tone="safe" variant="outline" mono size="sm" icon={LockOpen}>
              {t.open}
            </Badge>
          )
        }
      />
      <PanelBody className="flex flex-1 flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-body-sm text-fg-2">{t[id].role}</p>
          <div className="flex flex-col items-end gap-1">
            <Breaker state={!guarded ? "none" : market === null ? "unknown" : paused ? "tripped" : "armed"} />
            <Label tone={guarded && paused ? "liq" : undefined}>{!guarded ? t.breakerNone : paused ? t.breakerTripped : t.breakerArmed}</Label>
          </div>
        </div>

        <Readout>
          <ReadoutRow label={t.maxLtv} value={market === null ? null : fmt.pct(market.maxLtvBps / 10_000, 0)} tone={guarded && paused ? "warn" : undefined} />
          <ReadoutRow label={t.borrowed} value={market === null ? null : `${fmt.int(Number(market.borrowed / 10n ** 18n))} ${t.units}`} />
        </Readout>

        <div className="mt-auto flex flex-col gap-3">
          <Button variant={paused ? "alarm" : "secondary"} loading={flow.busy} onClick={tryBorrow} disabled={market === null}>
            {t.tryBorrow({ amount: fmt.int(UNITS) })}
          </Button>
          {paused ? <CostLine free locale={locale} /> : <CostLine gasLimit={BORROW_GAS} locale={locale} />}
          {blocked ? (
            <div className="flex flex-col gap-2" role="status">
              <pre className="overflow-x-auto rounded-control border border-liq/40 bg-bg px-3 py-2.5 font-mono text-caption leading-6">
                <span className="text-fg-3">$ {t.revertCall({ amount: `${fmt.int(UNITS)}e18` })}</span>
                {"\n"}
                <span className="text-liq-hi">✗ {t.revertLine}</span>
              </pre>
              <p className="text-caption text-fg-2">{t.pausedExplain}</p>
            </div>
          ) : (
            <TxProgress flow={flow.flow} outcome={flow.outcome} locale={locale} />
          )}
          {flow.outcome?.status === "confirmed" && id === "a" && <p className="text-caption text-fg-2">{t.borrowedOk}</p>}
        </div>
      </PanelBody>
    </Panel>
  );
}

export function GuardLive({ locale }: { locale: Locale }) {
  const t = guardMessages[locale];
  const fmt = formatters(locale);
  const { info, error, loading } = useGuardConfig();
  const markets = useGuardMarkets();
  const run = useTxFlow<RunGuardOutcome>();
  const { confirm, dialog } = useConfirmCost(locale);

  const runIt = async () => {
    run.start(["prepare", "send", "confirm"]);
    const out = await runGuard({ onEvent: run.onEvent, confirm });
    run.finish(out);
    void markets.refresh();
  };

  const cfg = info?.config;
  const asset = cfg ? DEPLOYMENT.assets[cfg.scenario.assetId & 0xff] : undefined;
  const checked = run.outcome?.status === "confirmed" ? run.outcome.checked : null;

  return (
    <div className="grid-page gap-y-6">
      <Panel as="section" aria-labelledby="guard-rule" className="col-span-full lg:col-span-5">
        <PanelHeading id="guard-rule" title={t.rule.title} actions={<ShieldAlert className="size-4 text-fg-3" aria-hidden />} />
        <PanelBody className="flex flex-col gap-5">
          {error ? (
            <Callout tone="liq" title={t.rule.error} />
          ) : (
            <dl className="flex flex-col divide-y divide-line" aria-busy={loading}>
              {(
                [
                  [
                    t.rule.scenario,
                    cfg && asset
                      ? t.rule.scenarioValue({
                          asset: symbolParts(asset).base,
                          shock: fmt.drop(cfg.scenario.shockBps / 10_000, cfg.scenario.shockBps % 100 === 0 ? 0 : 1),
                          oracle: cfg.scenario.oracleFeedbackBps > 0 ? t.rule.oracle.pool : t.rule.oracle.external,
                          positions: fmt.int(info?.preview.positionsUsed ?? cfg.scenario.maxPositions),
                        })
                      : null,
                    undefined,
                  ],
                  [
                    t.rule.trips,
                    cfg
                      ? [
                          t.rule.tripsValue({ bad: fmt.pct(cfg.badDebtThresholdBps / 10_000, cfg.badDebtThresholdBps % 100 === 0 ? 0 : 1) }),
                          cfg.liquidationThresholdBps > 0 ? t.rule.tripsLiq({ liq: fmt.pct(cfg.liquidationThresholdBps / 10_000, 1) }) : null,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      : null,
                    undefined,
                  ],
                  [t.rule.effect, cfg ? t.rule.effectValue({ ltv: fmt.pct(cfg.safeLtvBps / 10_000, 0) }) : null, undefined],
                  [
                    t.rule.now,
                    info ? (info.verdict.wouldTrip ? t.rule.nowTrip : t.rule.nowSafe)({ ratio: fmt.pct(info.verdict.badDebtRatioBps / 10_000) }) : null,
                    info ? (info.verdict.wouldTrip ? "text-liq-hi" : "text-safe") : undefined,
                  ],
                ] as [string, string | null, string | undefined][]
              ).map(([label, value, tone]) => (
                <div key={label} className="flex flex-col gap-1.5 py-3.5 first:pt-0 last:pb-0">
                  <dt className="label-mono text-fg-3">{label}</dt>
                  <dd className={cn("text-body-sm text-fg-1", tone)}>{value ?? <Skeleton className="h-4 w-3/4" />}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-col gap-2">
            <Label>{t.rule.contracts}</Label>
            {(
              [
                [t.rule.guard, DEPLOYMENT.contracts.guard],
                [t.rule.engine, cfg?.engine ?? null],
              ] as [string, string | null][]
            ).map(([name, address]) => (
              <p key={name} className="flex items-center justify-between gap-4 text-body-sm">
                <span className="text-fg-3">{name}</span>
                {address ? (
                  <a href={addrUrl(address)} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 font-mono text-caption text-fg-2 hover:text-fg-1">
                    {shortAddr(address)}
                    <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
                  </a>
                ) : (
                  <Skeleton className="h-4 w-24" />
                )}
              </p>
            ))}
          </div>
        </PanelBody>
      </Panel>

      <section aria-labelledby="guard-markets" className="col-span-full flex flex-col gap-4 lg:col-span-7">
        <h2 id="guard-markets" className="sr-only">
          {t.markets.title}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <MarketCard id="a" market={markets.a} locale={locale} onChange={() => void markets.refresh()} />
          <MarketCard id="b" market={markets.b} locale={locale} onChange={() => void markets.refresh()} />
        </div>
        <Panel className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex max-w-md flex-col gap-1.5">
              <h3 className="text-title-3 text-fg-1">{t.run.title}</h3>
              <p className="text-body-sm text-fg-2">{t.run.body}</p>
            </div>
            <Button variant="primary" loading={run.busy} onClick={runIt} disabled={!info}>
              {t.run.cta}
            </Button>
          </div>
          <CostLine gasLimit={info?.gasLimit ?? null} locale={locale} />
          <TxProgress flow={run.flow} outcome={run.outcome} locale={locale} />
          {checked && (
            <p className={cn("text-body-sm", checked.tripped ? "text-liq-hi" : "text-safe")}>
              {(checked.tripped ? t.run.tripped : t.run.safe)({ ratio: fmt.pct(Number(checked.badDebtRatioBps) / 10_000) })}
            </p>
          )}
        </Panel>
      </section>
      {dialog}
    </div>
  );
}
