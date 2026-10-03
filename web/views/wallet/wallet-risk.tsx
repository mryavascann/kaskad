"use client";

import { Activity, Fingerprint, Layers3, ScanSearch, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/design/ui/badge";
import { Button, ButtonArrow } from "@/design/ui/button";
import { ButtonLink } from "@/design/ui/button-link";
import { Callout } from "@/design/ui/callout";
import { Chip, ChipGroup } from "@/design/ui/chip";
import { Disclosure } from "@/design/ui/disclosure";
import { Field } from "@/design/ui/field";
import { HonestyTag } from "@/design/ui/honesty";
import { Input, addressInputProps } from "@/design/ui/input";
import { Label } from "@/design/ui/label";
import { Panel, PanelBody } from "@/design/ui/panel";
import { Skeleton } from "@/design/ui/skeleton";
import { Slider } from "@/design/ui/slider";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { commonMessages } from "@/i18n/messages/common";
import { walletMessages } from "@/i18n/messages/wallet";
import { useWalletRisk } from "@/lib/chain/hooks/useWalletRisk";
import { isAddressLoose } from "@/lib/chain/units";
import { symbolParts } from "@/lib/chain/scenario";
import { HEADLINE_CASCADE, SAMPLES, SURVIVE_HF_TARGET, SURVIVE_SHOCK_PCT, WALLET_CASCADE_SHOCK_BPS, type SupplyLine } from "@/lib/chain/wallet";
import { DEV_SIGNERS } from "@/lib/chain/signer-mode";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";
import { HealthDial } from "@/viz/health-dial";
import { PanelHeading } from "../shared/panel-heading";

/** Legacy symbols carry a maturity suffix (PT-AUSD-8OCT2026); show the base symbol. */
const base = (symbol: string) => symbolParts({ symbol }).base;

export function WalletRisk({ locale }: { locale: Locale }) {
  const t = walletMessages[locale];
  const c = commonMessages[locale];
  const fmt = formatters(locale);
  const w = useWalletRisk();
  const [input, setInput] = useState("");

  const headlineAsset = DEPLOYMENT.assets[String(HEADLINE_CASCADE.assetId)];
  const pos = w.position;
  const risk = w.risk;
  const d = risk?.dominant ?? null;
  const errorText = w.error ? t.search.errors[w.error.code] ?? t.search.errors.failed : null;
  const identityError = w.identity && !w.identity.ok ? t.search.identityErrors[w.identity.code] ?? t.search.identityErrors.failed : null;

  const submit = (address: string) => {
    setInput(address);
    void w.lookup(address);
  };

  // Shareable links: /wallet?address=0x… checks that address on load.
  const { lookup } = w;
  useEffect(() => {
    const address = new URLSearchParams(window.location.search).get("address");
    if (!address || !isAddressLoose(address)) return;
    const id = window.setTimeout(() => {
      setInput(address);
      void lookup(address);
    }, 0);
    return () => window.clearTimeout(id);
  }, [lookup]);

  // Keep the URL in step with the position on screen, so it can be copied and shared.
  const shown = w.position?.address;
  useEffect(() => {
    if (!shown) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("address")?.toLowerCase() === shown.toLowerCase()) return;
    url.searchParams.set("address", shown);
    window.history.replaceState(window.history.state, "", url);
  }, [shown]);

  return (
    <div className="flex flex-col gap-8">
      <Panel as="section" aria-labelledby="wallet-search">
        <PanelHeading
          id="wallet-search"
          title={t.search.title}
          actions={
            <Badge tone="neutral" variant="outline" size="sm" mono icon={ShieldCheck}>
              {t.search.readOnly}
            </Badge>
          }
        />
        <PanelBody className="flex flex-col gap-5">
          <form
            className="flex flex-col gap-3 md:flex-row md:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input.trim());
            }}
          >
            <Field label={t.search.label} hint={t.search.hint} error={errorText} className="min-w-0 flex-1">
              <Input
                {...addressInputProps}
                mono
                size="lg"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.search.placeholder}
                leading={<ScanSearch />}
                invalid={Boolean(errorText)}
              />
            </Field>
            <div className="flex flex-col">
              {/* Same height as the Field label, so the button lines up with the input on wide screens. */}
              <span aria-hidden className="invisible mb-2 hidden text-body-sm font-medium md:block">
                {t.search.label}
              </span>
              <Button type="submit" variant="primary" size="lg" loading={w.loading}>
                {t.search.check}
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => void w.lookupWith("mera")}>
              <Fingerprint aria-hidden />
              {t.search.mera}
            </Button>
            {/* Mera is the account layer in production (signer-mode.ts); the browser wallet is development-only. */}
            {DEV_SIGNERS && (
              <Button variant="secondary" size="sm" onClick={() => void w.lookupWith("injected")}>
                <WalletIcon aria-hidden />
                {t.search.injected}
              </Button>
            )}
            {identityError && <span className="text-caption text-liq-hi">{identityError}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label id="wallet-samples">{t.search.samples}</Label>
            <ChipGroup aria-labelledby="wallet-samples">
              {SAMPLES.map((s) => (
                <Chip key={s.id} pressed={w.address.toLowerCase() === s.address.toLowerCase()} onClick={() => submit(s.address)}>
                  {t.search.sampleLabels[s.id] ?? s.description}
                  <span className="font-mono text-fg-3">{shortAddr(s.address)}</span>
                </Chip>
              ))}
            </ChipGroup>
          </div>
        </PanelBody>
      </Panel>

      <div aria-live="polite" aria-busy={w.loading}>
        {!pos && !w.loading && (
          <ul className="grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 md:grid-cols-3">
            {t.empty.map(([title, body], i) => {
              const Icon = [ShieldCheck, Activity, Layers3][i];
              return (
                <li key={title} className="flex flex-col gap-3 bg-elev-1 p-6">
                  <Icon className="size-5 text-fg-3" aria-hidden />
                  <h2 className="text-title-3 text-fg-1">{title}</h2>
                  <p className="text-body-sm text-fg-2">{body}</p>
                </li>
              );
            })}
          </ul>
        )}

        {w.loading && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        )}

        {pos && risk && (
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Panel as="section" aria-labelledby="borrow-title" className="flex flex-col">
              <PanelHeading
                id="borrow-title"
                title={t.borrow.title}
                actions={
                  <span className="font-mono text-caption text-fg-3">
                    {t.borrow.meta({ address: shortAddr(pos.address), block: fmt.block(pos.block), emode: pos.eMode ? String(pos.eMode) : t.borrow.emodeNone })}
                  </span>
                }
              />
              <PanelBody className="flex flex-col gap-6">
                {!risk.borrower ? (
                  <p className="text-body text-fg-2">{t.borrow.noDebt}</p>
                ) : (
                  <>
                    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <HealthDial
                        value={risk.hf ?? Infinity}
                        target={SURVIVE_HF_TARGET}
                        locale={fmt.tag}
                        formatHf={(v) => fmt.num(v, 3)}
                        formatNum={(v) => fmt.num(v, 2)}
                        copy={t.dial}
                      />
                      <dl className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <dt className="label-mono text-fg-3">{t.borrow.collateral}</dt>
                          <dd className="font-mono text-metric-sm text-fg-1">{fmt.usd(pos.collateralUsd)}</dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="label-mono text-fg-3">{t.borrow.debt}</dt>
                          <dd className="font-mono text-metric-sm text-fg-1">{fmt.usd(pos.debtUsd)}</dd>
                        </div>
                      </dl>
                    </div>

                    {d && risk.thresholdState && (
                      <Panel tone={risk.thresholdState.kind === "never" ? "safe" : "liq"} className="flex flex-col gap-3 p-5">
                        <p className="text-title-3 text-fg-1">
                          {risk.thresholdState.kind === "liquidatable-now"
                            ? t.borrow.liquidatableNow
                            : risk.thresholdState.kind === "never"
                              ? t.borrow.never({ asset: base(d.symbol) })
                              : t.borrow.atDrop({ asset: base(d.symbol), drop: fmt.drop(risk.thresholdState.drop, 2) })}
                        </p>
                        <p className="flex flex-wrap items-center gap-2 text-caption text-fg-3">
                          <HonestyTag kind="model">{c.honesty.model}</HonestyTag>
                          {t.borrow.thresholdNote({ asset: base(d.symbol), supplied: fmt.usd(d.suppliedUsd), lt: fmt.pct(d.ltBps / 10_000, 0) })}
                        </p>
                      </Panel>
                    )}

                    {d && w.cascade && risk.cascadeDrop !== null && risk.cascadeStuckDebtUsd !== null && risk.cascadeBadDebtUsd !== null && (
                      <section aria-labelledby="cascade-title" className="flex flex-col gap-3 border-t border-line pt-5">
                        <h3 id="cascade-title" className="label-mono text-fg-3">
                          {t.cascade.title}
                        </h3>
                        <p className="text-body-sm text-fg-2">
                          {t.cascade.body({
                            asset: base(d.symbol),
                            shock: fmt.drop(WALLET_CASCADE_SHOCK_BPS / 10_000, 0),
                            drop: fmt.pct(risk.cascadeDrop, 1),
                            stuck: fmt.usd(risk.cascadeStuckDebtUsd),
                            bad: fmt.usd(risk.cascadeBadDebtUsd),
                          })}
                        </p>
                        {risk.liquidatedInCascade !== null && (
                          <p className={cn("text-body-sm font-medium", risk.liquidatedInCascade ? "text-liq-hi" : "text-safe")}>
                            {risk.liquidatedInCascade ? t.cascade.liquidated : t.cascade.survives}
                          </p>
                        )}
                        <ButtonLink href={href("app", locale)} variant="ghost" size="sm" className="w-fit">
                          {t.cascade.open}
                          <ButtonArrow />
                        </ButtonLink>
                      </section>
                    )}

                    {d && w.survive && (
                      <section aria-labelledby="protect-title" className="flex flex-col gap-4 border-t border-line pt-5">
                        <h3 id="protect-title" className="label-mono text-fg-3">
                          {t.protect.title({ asset: base(d.symbol), target: fmt.num(SURVIVE_HF_TARGET, 2) })}
                        </h3>
                        <Slider
                          label={t.protect.slider}
                          value={w.shockPct}
                          onValueChange={w.setShockPct}
                          min={SURVIVE_SHOCK_PCT.min}
                          max={SURVIVE_SHOCK_PCT.max}
                          step={1}
                          toneForValue={(v) => (v >= 20 ? "liq" : v >= 5 ? "warn" : "calm")}
                          formatValue={(v) => fmt.drop(v / 100, 0)}
                          showValue
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1 rounded-control border border-line-2 p-4">
                            <span className="font-mono text-metric-sm text-safe">+{fmt.usd(w.survive.addCollateralUsd)}</span>
                            <span className="text-caption text-fg-3">{t.protect.addCollateral({ asset: base(d.symbol) })}</span>
                          </div>
                          <div className="flex flex-col gap-1 rounded-control border border-line-2 p-4">
                            <span className="font-mono text-metric-sm text-safe">{fmt.usd(w.survive.repayUsd)}</span>
                            <span className="text-caption text-fg-3">{t.protect.repay}</span>
                          </div>
                        </div>
                      </section>
                    )}
                  </>
                )}
              </PanelBody>
            </Panel>

            <Panel as="section" aria-labelledby="supply-title">
              <PanelHeading id="supply-title" title={t.supply.title} />
              <PanelBody className="flex flex-col gap-5">
                {risk.supplied.length === 0 ? (
                  <p className="text-body text-fg-2">{t.supply.none}</p>
                ) : (
                  <>
                    {/* Under 640 px each asset is a stacked card (four columns don't fit at 360–390); a table above. */}
                    <ul className="flex flex-col divide-y divide-line sm:hidden">
                      {risk.supplied.map((r) => (
                        <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="text-body-sm font-medium text-fg-1">{base(r.symbol)}</span>
                            <span className="font-mono text-body-sm text-fg-1">
                              <span className="sr-only">{t.supply.columns.supplied}: </span>
                              {fmt.usd(r.suppliedUsd)}
                            </span>
                          </p>
                          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
                            <dt className="label-mono text-fg-3">{t.supply.columns.utilization}</dt>
                            <dd className={cn("text-right font-mono", r.withdraw === "at-risk" ? "text-liq-hi" : "text-fg-2")}>{fmt.pct(r.utilization)}</dd>
                            <dt className="label-mono text-fg-3">{t.supply.columns.withdraw}</dt>
                            <dd className="text-right">
                              <WithdrawState r={r} t={t} fmt={fmt} />
                            </dd>
                          </dl>
                        </li>
                      ))}
                    </ul>
                    <div className="hidden sm:block">
                      <table className="w-full text-left text-body-sm">
                        <thead>
                          <tr className="border-b border-line">
                            {Object.values(t.supply.columns).map((h) => (
                              <th key={h} scope="col" className="label-mono py-2 pr-3 font-normal text-fg-3 last:pr-0">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {risk.supplied.map((r) => (
                            <tr key={r.id}>
                              <td className="py-3 pr-3 text-fg-1">{base(r.symbol)}</td>
                              <td className="py-3 pr-3 font-mono text-fg-1">{fmt.usd(r.suppliedUsd)}</td>
                              <td className={cn("py-3 pr-3 font-mono", r.withdraw === "at-risk" ? "text-liq-hi" : "text-fg-2")}>{fmt.pct(r.utilization)}</td>
                              <td className="py-3 text-caption">
                                <WithdrawState r={r} t={t} fmt={fmt} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {risk.lentUsd > 0 && risk.headlineBadDebtUsd !== null && headlineAsset && (
                      <Callout tone="warn" title={t.supply.loss}>
                        <p>
                          {t.supply.lossBody({
                            asset: base(headlineAsset.symbol),
                            shock: fmt.drop(HEADLINE_CASCADE.shockBps / 10_000, 0),
                            bad: fmt.usd(risk.headlineBadDebtUsd),
                            share: fmt.usd(risk.lossShareUsd),
                          })}
                        </p>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-caption text-fg-3">
                          <HonestyTag kind="estimate">{c.honesty.estimate}</HonestyTag>
                          {t.supply.lossNote}
                        </p>
                      </Callout>
                    )}
                    <Disclosure summary={t.supply.withdrawHow}>
                      <p className="text-body-sm text-fg-2">{t.supply.withdrawBody}</p>
                    </Disclosure>
                  </>
                )}
              </PanelBody>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

/** The withdrawal cell of a supplied asset (shared by the stacked list and the table). */
function WithdrawState({ r, t, fmt }: { r: SupplyLine; t: (typeof walletMessages)[Locale]; fmt: ReturnType<typeof formatters> }) {
  if (r.withdraw === "at-risk") return <span className="text-liq-hi">{t.supply.atRisk({ liquidity: fmt.pct(r.liquidityShare) })}</span>;
  if (r.withdraw === "withdrawable") return <span className="text-safe">{t.supply.withdrawable}</span>;
  return <span className="text-fg-3">{t.supply.collateralOnly}</span>;
}
