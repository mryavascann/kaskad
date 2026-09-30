"use client";

import { ArrowUpRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/design/ui/dialog";
import { Steps } from "@/design/ui/steps";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { txMessages } from "@/i18n/messages/tx";
import { quoteCost, type ConfirmCost, type CostQuote } from "@/lib/chain/cost";
import { useSigner } from "@/lib/chain/hooks/useSigner";
import type { TxEvent } from "@/lib/chain/status";
import type { TxOutcome } from "@/lib/chain/tx";
import { txUrl } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { applyEvent, failFlow, passCheck, startFlow, type FlowStepId, type FlowState } from "./flow";

/** Flow state + the callbacks the chain actions take (`onEvent`). `O` keeps an action's extras (decoded events). */
export function useTxFlow<O extends TxOutcome = TxOutcome>() {
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [outcome, setOutcome] = useState<O | null>(null);
  const start = useCallback((steps: FlowStepId[]) => {
    setOutcome(null);
    setFlow(startFlow(steps));
  }, []);
  const onEvent = useCallback((ev: TxEvent) => setFlow((f) => (f ? applyEvent(f, ev) : f)), []);
  const checked = useCallback(() => setFlow((f) => (f ? passCheck(f) : f)), []);
  const finish = useCallback((out: O) => {
    setOutcome(out);
    setFlow((f) => {
      if (!f) return f;
      if (out.status === "failed") return f.error ? f : failFlow(f, out.error.code);
      if (out.status === "reverted") return f.error ? f : failFlow(f, "reverted");
      if (out.status === "cancelled") return null;
      return f;
    });
  }, []);
  const busy = flow !== null && outcome === null;
  return { flow, outcome, busy, start, onEvent, checked, finish };
}

/** "~0.14 MON · testnet, the sponsor pays" (or the free line for eth_call reads). */
export function CostLine({ gasLimit, locale, free = false, className }: { gasLimit?: bigint | null; locale: Locale; free?: boolean; className?: string }) {
  const t = txMessages[locale].cost;
  const signer = useSigner();
  if (free) return <p className={cn("label-mono text-fg-3", className)}>{t.free}</p>;
  if (gasLimit == null) return <p className={cn("label-mono text-fg-3", className)} aria-busy>{t.label} …</p>;
  const q = quoteCost(gasLimit, signer.kind);
  const fmt = formatters(locale);
  return (
    <p className={cn("label-mono text-fg-3", q.heavy && "text-warn", className)}>
      {t.label}: <span className="text-fg-2">{q.belowMinDisplay ? fmt.mon(q.mon) : `~${fmt.mon(q.mon)}`}</span> · {t.payer[q.payer]}
      {q.heavy && ` · ${t.heavy}`}
    </p>
  );
}

/** Steps of a running or finished flow, plus the outcome line with its MonadScan link. */
export function TxProgress({ flow, outcome, locale, errorText }: { flow: FlowState | null; outcome: TxOutcome | null; locale: Locale; errorText?: string }) {
  const t = txMessages[locale];
  const fmt = formatters(locale);
  if (!flow && !outcome) return null;
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {flow && (
        <Steps
          statusLabels={t.stepStatus}
          steps={flow.items.map((s) => ({
            id: s.id,
            label: t.steps[s.id],
            status: s.status,
            detail: s.status === "error" ? (errorText ?? (flow.error === "reverted" ? t.result.reverted : flow.error ? t.errors[flow.error] : undefined)) : undefined,
          }))}
        />
      )}
      {outcome && (outcome.status === "confirmed" || outcome.status === "reverted") && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
          <span className={outcome.status === "confirmed" ? "text-safe" : "text-liq-hi"}>
            {outcome.status === "confirmed" ? t.result.confirmed({ ms: fmt.ms(outcome.ms), sync: outcome.sync }) : t.result.reverted}
          </span>
          <a
            href={txUrl(outcome.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1 font-mono text-fg-2 hover:text-fg-1"
          >
            {outcome.hash.slice(0, 6)}…{outcome.hash.slice(-4)}
            <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
            <span className="sr-only">({t.result.open})</span>
          </a>
        </p>
      )}
      {outcome?.status === "cancelled" && <p className="text-caption text-fg-3">{t.result.cancelled}</p>}
    </div>
  );
}

/** Injectable >= 1 MON confirmation (lib/chain/cost ConfirmCost) rendered as a ConfirmDialog. */
export function useConfirmCost(locale: Locale) {
  const t = txMessages[locale];
  const fmt = formatters(locale);
  const [quote, setQuote] = useState<CostQuote | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm: ConfirmCost = useCallback(
    (q) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setQuote(q);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setQuote(null);
  };

  const dialog = (
    <ConfirmDialog
      open={quote !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={t.confirm.title}
      description={quote ? t.confirm.description({ mon: `~${fmt.mon(quote.mon)}`, payer: t.cost.payer[quote.payer] }) : undefined}
      confirmLabel={t.confirm.confirm}
      cancelLabel={t.confirm.cancel}
      tone="warn"
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, dialog };
}
