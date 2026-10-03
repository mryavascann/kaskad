"use client";

import { ArrowUpRight, Lock, LockOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/design/ui/panel";
import { Readout, ReadoutRow } from "@/design/ui/readout";
import { Skeleton } from "@/design/ui/skeleton";
import type { Tone } from "@/design/ui/tone";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { guardMessages } from "@/i18n/messages/guard";
import { preloadAction, publishRisk, rebalanceVault, refreshGuardV2, type RiskActionOutcome } from "@/lib/chain/actions/lazy";
import { useRiskSystem } from "@/lib/chain/hooks/useRiskSystem";
import {
  assetStatus,
  GUARD_V2_REFRESH_GAS,
  nextPublishAt,
  publishGasLimit,
  VAULT_REBALANCE_GAS,
  type AssetStatus,
  type RiskAsset,
  type RiskMarket,
  type RiskSystem,
} from "@/lib/chain/risk-oracle";
import { symbolParts } from "@/lib/chain/scenario";
import { addrUrl, DEPLOYMENT, RISK } from "@/lib/kaskad/config";
import { shortAddr, wadToNum } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";
import { PasskeyGate } from "../shared/tx/passkey-gate";
import { CostLine, TxProgress, useConfirmCost, useTxFlow } from "../shared/tx/tx-parts";

const STATUS_TONE: Record<AssetStatus, Tone> = { none: "neutral", stale: "warn", "at-risk": "liq", clear: "safe" };
const KUSD = 1e6;
const SIZE_RETRIES = 3;

const symbolOf = (assetId: number) => {
  const a = DEPLOYMENT.assets[assetId];
  return a ? symbolParts(a).base : String(assetId);
};

/** Unix seconds, ticking every 15 s (cooldowns and report ages); 0 until mounted, so SSR matches. */
function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function AssetCard({
  asset,
  now,
  maxReportAge,
  locale,
  onDone,
}: {
  asset: RiskAsset;
  now: number;
  maxReportAge: number;
  locale: Locale;
  onDone: (s: RiskSystem | null) => void;
}) {
  const t = guardMessages[locale].oracle;
  const fmt = formatters(locale);
  const flow = useTxFlow<RiskActionOutcome>();
  const { confirm, dialog } = useConfirmCost(locale);
  const [gas, setGas] = useState<bigint | null>(null);
  const { assetId, rule, state } = asset;
  const symbol = symbolOf(assetId);
  const status = assetStatus(asset, now, maxReportAge);
  const waitSec = now === 0 ? 0 : nextPublishAt(asset) - now;
  const report = asset.reports.find((r) => r.publishedAt > 0) ?? null;
  const pct = (bps: number) => fmt.pct(bps / 10_000, bps % 100 === 0 ? 0 : 1);

  // The four free previews publish() will run size its gas limit (and the cost line). They are not
  // urgent: a rate-limited attempt (the page's first reads land at the same time) is retried.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      publishGasLimit(asset)
        .then((g) => live && setGas(g))
        .catch(() => {
          if (live && n < SIZE_RETRIES) timer = setTimeout(() => attempt(n + 1), 2_000 * 2 ** n);
        });
    };
    attempt(0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // Re-sized only when the scenario changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, rule.steps, rule.rounds, rule.maxPositions, rule.oracleFeedbackBps, asset.bookPositions]);

  const preload = () => preloadAction("risk");
  const run = async () => {
    flow.start(["prepare", "send", "confirm"]);
    const out = await publishRisk(asset, { onEvent: flow.onEvent, confirm });
    flow.finish(out);
    if (out.status === "confirmed" || out.status === "reverted") onDone(out.system);
  };
  const after = flow.outcome?.status === "confirmed" ? flow.outcome.system?.assets.find((a) => a.assetId === assetId) : undefined;

  return (
    <Panel as="article" aria-labelledby={`risk-${assetId}-title`} tone={status === "at-risk" ? "liq" : undefined} className="flex flex-col">
      <PanelHeader
        title={<span id={`risk-${assetId}-title`}>{symbol}</span>}
        actions={
          <Badge tone={STATUS_TONE[status]} variant={status === "at-risk" ? "solid" : "outline"} mono size="sm">
            {t.status[status]}
          </Badge>
        }
      />
      <PanelBody className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-body-sm text-fg-2">
          <p>{t.rule({ shock: fmt.drop(rule.triggerShockBps / 10_000, 0), loss: pct(rule.lossThresholdBps), stuck: pct(rule.stuckThresholdBps) })}</p>
          <p>{t.ltvRule({ step: pct(rule.ltvStepBps), floor: pct(rule.ltvFloorBps), ceiling: pct(rule.ltvCeilingBps) })}</p>
        </div>

        <Readout>
          <ReadoutRow label={t.recommended} value={pct(state.recommendedLtvBps)} tone={state.atRisk ? "warn" : undefined} />
          <ReadoutRow label={t.loss} value={state.lastPublished ? pct(state.lossBps) : "—"} tone={state.atRisk ? "liq" : undefined} />
          <ReadoutRow label={t.stuck} value={state.lastPublished ? pct(state.stuckBps) : "—"} />
        </Readout>

        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <caption className="sr-only">{t.table.caption({ asset: symbol })}</caption>
            <thead>
              <tr className="border-b border-line text-left">
                {[t.table.shock, t.table.bad, t.table.stuck, t.table.hidden].map((h, i) => (
                  <th key={h} scope="col" className={cn("label-mono py-2 font-normal text-fg-3", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asset.reports.map((r) => (
                <tr
                  key={r.shockBps}
                  className={cn("border-b border-line last:border-0", r.shockBps === rule.triggerShockBps && "bg-elev-2")}
                  aria-current={r.shockBps === rule.triggerShockBps ? "true" : undefined}
                >
                  <th scope="row" className="py-2 text-left font-mono font-normal text-fg-1">
                    {fmt.drop(r.shockBps / 10_000, 0)}
                  </th>
                  {r.publishedAt === 0 ? (
                    <td colSpan={3} className="py-2 text-right font-mono text-fg-3">
                      —
                    </td>
                  ) : (
                    <>
                      <td className="py-2 text-right font-mono text-fg-1">{fmt.usd(wadToNum(r.badDebt))}</td>
                      <td className="py-2 text-right font-mono text-fg-2">{fmt.usd(wadToNum(r.stuckDebt))}</td>
                      <td className={cn("py-2 text-right font-mono", r.hiddenBadDebt > 0n ? "text-warn" : "text-fg-2")}>
                        {fmt.usd(wadToNum(r.hiddenBadDebt))}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-caption text-fg-3">
            {report && now > 0
              ? `${t.published({ minutes: fmt.int(Math.max(0, Math.floor((now - report.publishedAt) / 60))), block: fmt.block(report.blockNumber) })} · ${t.positions({ n: fmt.int(report.positions) })}`
              : report
                ? t.positions({ n: fmt.int(report.positions) })
                : t.never}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <PasskeyGateButton locale={locale}>
            <Button variant="secondary" loading={flow.busy} onClick={run} onPointerEnter={preload} onFocus={preload} disabled={waitSec > 0}>
              {t.publish({ asset: symbol })}
            </Button>
          </PasskeyGateButton>
          {waitSec > 0 ? <p className="label-mono text-fg-3">{t.cooldown({ minutes: fmt.int(Math.ceil(waitSec / 60)) })}</p> : <CostLine gasLimit={gas} locale={locale} />}
          <TxProgress flow={flow.flow} outcome={flow.outcome} locale={locale} />
          {after && (
            <p className={cn("text-body-sm", after.state.atRisk ? "text-liq-hi" : "text-safe")}>
              {t.publishedOk({ status: t.status[after.state.atRisk ? "at-risk" : "clear"], ltv: pct(after.state.recommendedLtvBps) })}
            </p>
          )}
        </div>
      </PanelBody>
      {dialog}
    </Panel>
  );
}

function PasskeyGateButton({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <PasskeyGate locale={locale} variant="secondary" size="md" label={consoleMessages[locale].signer.signIn}>
      {children}
    </PasskeyGate>
  );
}

function MarketRow({ market, locale }: { market: RiskMarket; locale: Locale }) {
  const t = guardMessages[locale];
  const fmt = formatters(locale);
  return (
    <li className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <a href={addrUrl(market.address)} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 text-body-sm text-fg-1 hover:underline">
          {market.name}
          <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
        </a>
        {market.paused ? (
          <Badge tone="liq" variant="solid" mono size="sm" icon={Lock}>
            {t.markets.paused}
          </Badge>
        ) : (
          <Badge tone="safe" variant="outline" mono size="sm" icon={LockOpen}>
            {t.markets.open}
          </Badge>
        )}
      </div>
      <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-caption text-fg-2">
        <span>
          {t.markets.maxLtv} {fmt.pct(market.maxLtvBps / 10_000, 0)}
        </span>
        <span>
          {t.oracle.markets.vaultIn} {fmt.usd(Number(market.vaultDeposit) / KUSD)}
          {market.flagged && <span className="text-warn"> · {t.oracle.markets.kept}</span>}
        </span>
      </p>
    </li>
  );
}

export function RiskOracleLive({ locale }: { locale: Locale }) {
  const t = guardMessages[locale].oracle;
  const fmt = formatters(locale);
  const { system, error, set } = useRiskSystem();
  const now = useNow();
  const guard = useTxFlow<RiskActionOutcome>();
  const vault = useTxFlow<RiskActionOutcome>();

  const preload = () => preloadAction("risk");
  const runGuardV2 = async () => {
    guard.start(["send", "confirm"]);
    const out = await refreshGuardV2({ onEvent: guard.onEvent });
    guard.finish(out);
    if (out.status === "confirmed" || out.status === "reverted") set(out.system);
  };
  const runVault = async () => {
    vault.start(["send", "confirm"]);
    const out = await rebalanceVault({ onEvent: vault.onEvent });
    vault.finish(out);
    if (out.status === "confirmed" || out.status === "reverted") set(out.system);
  };

  if (error) return <Callout tone="liq" title={t.error} />;

  return (
    <div className="grid-page gap-y-6">
      <section aria-label={t.title} className="col-span-full grid gap-4 sm:grid-cols-2 lg:col-span-7">
        {system
          ? system.assets.map((a) => <AssetCard key={a.assetId} asset={a} now={now} maxReportAge={system.guard.maxReportAge} locale={locale} onDone={set} />)
          : [0, 1].map((i) => <Skeleton key={i} className="h-[30rem] rounded-panel" />)}
      </section>

      <div className="col-span-full flex flex-col gap-4 lg:col-span-5">
        <Panel className="flex flex-col">
          <PanelHeader title={t.markets.title} />
          <PanelBody>
            {system ? (
              <ul className="flex flex-col divide-y divide-line">
                {system.markets.map((m) => (
                  <MarketRow key={m.address} market={m} locale={locale} />
                ))}
              </ul>
            ) : (
              <Skeleton className="h-24" />
            )}
          </PanelBody>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHeader title={t.vault.title} />
          <PanelBody className="flex flex-col gap-4">
            <p className="text-body-sm text-fg-2">{t.vault.body}</p>
            <Readout>
              <ReadoutRow label={t.vault.total} value={system ? `${fmt.usd(Number(system.vault.totalAssets) / KUSD)} kUSD` : null} />
              <ReadoutRow label={t.vault.idle} value={system ? `${fmt.usd(Number(system.vault.idle) / KUSD)} kUSD` : null} />
            </Readout>
          </PanelBody>
        </Panel>

        <Panel className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-title-3 text-fg-1">{t.actions.title}</h3>
            <p className="text-body-sm text-fg-2">{t.actions.body}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>GuardV2.refresh()</Label>
            <PasskeyGateButton locale={locale}>
              <Button variant="primary" loading={guard.busy} onClick={runGuardV2} onPointerEnter={preload} onFocus={preload} disabled={!system}>
                {t.actions.guard}
              </Button>
            </PasskeyGateButton>
            <CostLine gasLimit={GUARD_V2_REFRESH_GAS} locale={locale} />
            <TxProgress flow={guard.flow} outcome={guard.outcome} locale={locale} />
            {guard.outcome?.status === "confirmed" && <p className="text-body-sm text-safe">{t.actions.guardDone}</p>}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Label>RiskVault.rebalance()</Label>
            <PasskeyGateButton locale={locale}>
              <Button variant="secondary" loading={vault.busy} onClick={runVault} onPointerEnter={preload} onFocus={preload} disabled={!system}>
                {t.actions.vault}
              </Button>
            </PasskeyGateButton>
            <CostLine gasLimit={VAULT_REBALANCE_GAS} locale={locale} />
            <TxProgress flow={vault.flow} outcome={vault.outcome} locale={locale} />
            {vault.outcome?.status === "confirmed" && <p className="text-body-sm text-safe">{t.actions.vaultDone}</p>}
          </div>
        </Panel>

        <div className="flex flex-col gap-2">
          <Label>{t.contracts}</Label>
          {(
            [
              ["RiskOracle", RISK.riskOracle],
              ["GuardV2", RISK.guardV2],
              ["RiskVault", RISK.riskVault],
              ["KaskadMCv3", RISK.kaskadMCv3],
            ] as const
          ).map(([name, address]) => (
            <p key={name} className="flex items-center justify-between gap-4 text-body-sm">
              <span className="text-fg-3">{name}</span>
              <a href={addrUrl(address)} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 font-mono text-caption text-fg-2 hover:text-fg-1">
                {shortAddr(address)}
                <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
              </a>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
