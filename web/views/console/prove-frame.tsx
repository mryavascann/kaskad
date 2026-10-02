"use client";

import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Panel } from "@/design/ui/panel";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { txMessages } from "@/i18n/messages/tx";
import { proveScenarioGasLimit } from "@/lib/chain/actions/gas";
import { quoteCost } from "@/lib/chain/cost";
import { DEFAULT_SIGNER } from "@/lib/chain/signer-mode";
import { cn } from "@/lib/utils";
import { PasskeyGate } from "../shared/tx/passkey-gate";
import type { PreviewState } from "./result-stage";

/** "Prove it on chain": title and body, the action (button + cost line), the badge row, then `children` (progress). */
export function ProveFrame({ locale, action, badges, children }: { locale: Locale; action: ReactNode; badges: ReactNode; children?: ReactNode }) {
  const t = consoleMessages[locale].prove;
  return (
    <Panel as="section" aria-labelledby="prove-title" corners className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-lg flex-col gap-2">
          <h3 id="prove-title" className="text-title-3 text-fg-1">
            {t.title}
          </h3>
          <p className="text-body-sm text-fg-2">{t.body}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:items-end">{action}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">{badges}</div>
      {children}
    </Panel>
  );
}

/** The free preview's badge ("<ms> · <n> positions"), or the waiting line. */
export function PreviewBadges({ locale, preview, positions }: { locale: Locale; preview: PreviewState; positions?: number }) {
  const t = consoleMessages[locale].prove;
  const fmt = formatters(locale);
  const n = positions ?? preview.result?.positionsUsed;
  if (!preview.result || n === undefined) {
    return (
      <span className="text-caption text-fg-3" aria-busy>
        {t.waiting}
      </span>
    );
  }
  return (
    <>
      <Badge tone="monad" variant="outline" mono icon={null}>
        {t.badgePreview({ ms: fmt.ms(preview.ms), positions: fmt.int(n) })}
      </Badge>
      <span className="text-caption text-fg-3">{t.badgePreviewNote}</span>
    </>
  );
}

/**
 * The panel before its flow code has loaded (`LazyProvePanel`): same layout and state, the cost for
 * the signer every page load starts with (DEFAULT_SIGNER; only the signer module can switch it, and it
 * loads later). A press asks for the flow (`onProve`), which starts once it has loaded. With Mera not
 * signed in yet, the press is "Sign in with passkey" instead (PasskeyGate).
 */
export function StaticProvePanel({ locale, preview, onProve }: { locale: Locale; preview: PreviewState; onProve: () => void }) {
  const t = consoleMessages[locale].prove;
  const tc = txMessages[locale].cost;
  const fmt = formatters(locale);
  const q = preview.result ? quoteCost(proveScenarioGasLimit(preview.result), DEFAULT_SIGNER) : null;
  return (
    <ProveFrame
      locale={locale}
      badges={<PreviewBadges locale={locale} preview={preview} />}
      action={
        <>
          <PasskeyGate locale={locale}>
            <Button variant="primary" size="lg" disabled={!preview.result || preview.loading} onClick={onProve}>
              {t.cta}
              <ArrowUpRight aria-hidden />
            </Button>
          </PasskeyGate>
          {q ? (
            <p className={cn("label-mono text-fg-3 md:text-right", q.heavy && "text-warn")}>
              {tc.label}: <span className="text-fg-2">{q.belowMinDisplay ? fmt.mon(q.mon) : `~${fmt.mon(q.mon)}`}</span> · {tc.payer[q.payer]}
              {q.heavy && ` · ${tc.heavy}`}
            </p>
          ) : (
            <p className="label-mono text-fg-3 md:text-right" aria-busy>
              {tc.label} …
            </p>
          )}
        </>
      }
    />
  );
}
