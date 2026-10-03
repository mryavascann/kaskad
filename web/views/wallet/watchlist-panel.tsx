"use client";

import { KeyRound, Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Field } from "@/design/ui/field";
import { Input } from "@/design/ui/input";
import { Panel, PanelBody } from "@/design/ui/panel";
import { Skeleton } from "@/design/ui/skeleton";
import type { Tone } from "@/design/ui/tone";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { walletMessages } from "@/i18n/messages/wallet";
import { useWatchlist, type WatchCheck } from "@/lib/chain/hooks/useWatchlist";
import { ALERT_DROP_PCT } from "@/lib/chain/watchlist";
import { shortAddr } from "@/lib/kaskad/format";
import { PanelHeading } from "../shared/panel-heading";
import { PasskeyGate } from "../shared/tx/passkey-gate";

const TONE: Record<WatchCheck["status"], Tone> = { alert: "liq", "liquidatable-now": "liq", ok: "safe", "no-debt": "neutral", checking: "neutral", error: "warn" };

/**
 * "Private watchlist": the signed-in passkey's addresses with an alert drop each, sealed in the
 * browser (lib/chain/watchlist.ts). `current`: the address checked above, offered for adding.
 * `onCheck` opens an entry in the lookup above.
 */
export function WatchlistPanel({ locale, current, onCheck }: { locale: Locale; current: string | null; onCheck: (address: string) => void }) {
  const t = walletMessages[locale].watchlist;
  const fmt = formatters(locale);
  const w = useWatchlist();
  const [alertPct, setAlertPct] = useState<string>(String(ALERT_DROP_PCT.default));
  const [label, setLabel] = useState("");
  const listed = current ? w.entries.find((e) => e.address.toLowerCase() === current.toLowerCase()) : undefined;
  const pct = Number(alertPct.replace(",", "."));
  const pctOk = Number.isFinite(pct) && pct >= ALERT_DROP_PCT.min && pct <= ALERT_DROP_PCT.max;

  const statusText = (c: WatchCheck) => {
    const drop = c.drop === null ? null : fmt.pct(c.drop);
    if (c.status === "alert") return t.status.alert({ drop: drop ?? "" });
    if (c.status === "ok") return t.status.ok({ drop });
    return t.status[c.status];
  };

  return (
    <Panel as="section" aria-labelledby="watchlist-title">
      <PanelHeading
        id="watchlist-title"
        title={t.title}
        actions={
          <Badge tone="monad" variant="outline" size="sm" mono icon={Lock}>
            {t.badge}
          </Badge>
        }
      />
      <PanelBody className="flex flex-col gap-5">
        <p className="max-w-2xl text-body-sm text-fg-2">{t.lead}</p>

        <PasskeyGate locale={locale} variant="secondary" size="md" label={t.signIn} className="self-start">
          {w.status === "loading" ? (
            <Skeleton className="h-24" aria-label={t.loading} />
          ) : w.status === "error" ? (
            <Callout tone="warn" title={t.errors[w.error ?? "failed"]} />
          ) : (
            <div className="flex flex-col gap-5">
              {w.error && <Callout tone="warn" title={t.errors[w.error]} className="py-2.5" />}

              {current && (
                <form
                  className="flex flex-col gap-3 rounded-panel border border-line-2 bg-elev-1 p-4 md:flex-row md:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (pctOk) void w.add(current, pct, label);
                  }}
                >
                  <p className="text-body-sm font-medium text-fg-1 md:mb-3 md:w-40">{t.addTitle({ address: shortAddr(current) })}</p>
                  <Field label={t.alertLabel} className="md:w-56">
                    <Input inputMode="decimal" mono value={alertPct} onChange={(e) => setAlertPct(e.target.value)} invalid={!pctOk} />
                  </Field>
                  <Field label={t.labelLabel} className="min-w-0 flex-1">
                    <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
                  </Field>
                  <Button type="submit" variant="secondary" loading={w.saving} disabled={!pctOk}>
                    {listed ? t.update : t.add}
                  </Button>
                </form>
              )}

              {w.entries.length === 0 ? (
                <p className="text-body-sm text-fg-3">{t.empty}</p>
              ) : (
                <>
                  <ul className="flex flex-col divide-y divide-line rounded-panel border border-line-2">
                    {w.entries.map((e) => {
                      const c = w.checks[e.address];
                      return (
                        <li key={e.address} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                          <button type="button" className="font-mono text-body-sm text-fg-1 underline-offset-4 hover:underline" onClick={() => onCheck(e.address)}>
                            {shortAddr(e.address)}
                          </button>
                          {e.label && <span className="text-body-sm text-fg-2">{e.label}</span>}
                          <span className="label-mono text-fg-3">{t.alertAt({ pct: fmt.pct(e.alertDropPct / 100) })}</span>
                          {c && (
                            <Badge tone={TONE[c.status]} variant="outline" size="sm">
                              {statusText(c)}
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto"
                            aria-label={t.remove({ address: shortAddr(e.address) })}
                            disabled={w.saving}
                            onClick={() => void w.remove(e.address)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  <Button variant="secondary" size="sm" className="self-start" onClick={() => void w.checkAll()}>
                    {t.checkAll}
                  </Button>
                </>
              )}
            </div>
          )}
        </PasskeyGate>

        <p className="flex max-w-2xl items-start gap-2 text-caption text-fg-3">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t.privacy}
        </p>
      </PanelBody>
    </Panel>
  );
}
