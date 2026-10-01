"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useCue } from "@/audio/use-cue";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { preloadAction, proveScenario, proveScenarioGasLimit, type ProveScenarioOutcome } from "@/lib/chain/actions/lazy";
import { txUrl } from "@/lib/kaskad/config";
import { CostLine, TxProgress, useConfirmCost, useTxFlow } from "../shared/tx/tx-parts";
import { PreviewBadges, ProveFrame } from "./prove-frame";
import type { PreviewState } from "./result-stage";

/**
 * "Prove on chain": the badge (free preview, then the tx), the cost line, the flow. Loaded by
 * `LazyProvePanel`; `startOnMount`: the reader already pressed the button of the stand-in panel.
 */
export function ProvePanel({ locale, preview, startOnMount = false }: { locale: Locale; preview: PreviewState; startOnMount?: boolean }) {
  const t = consoleMessages[locale].prove;
  const fmt = formatters(locale);
  const flow = useTxFlow<ProveScenarioOutcome>();
  const { confirm, dialog } = useConfirmCost(locale);
  const [provedKey, setProvedKey] = useState<string | null>(null);
  const { result, resultScenario, loading } = preview;
  const key = resultScenario ? JSON.stringify(resultScenario) : null;

  const preloadProve = () => preloadAction("proveScenario");
  const prove = async () => {
    if (!result || !resultScenario) return;
    setProvedKey(key);
    flow.start(["send", "confirm"]);
    const out = await proveScenario(resultScenario, result, { onEvent: flow.onEvent, confirm });
    flow.finish(out);
  };

  // The press on the stand-in counts once, for the result it was made on.
  const pressed = useRef(startOnMount);
  const startPressed = useEffectEvent(() => {
    if (!pressed.current) return;
    pressed.current = false;
    if (result && !loading) void prove();
  });
  useEffect(() => {
    const id = setTimeout(startPressed, 0);
    return () => clearTimeout(id);
  }, []);

  const out = flow.outcome;
  const cue = useCue();
  useEffect(() => {
    if (out?.status === "confirmed") cue("tick");
  }, [out, cue]);
  const proved = out?.status === "confirmed" && provedKey === key ? out : null;
  const positions = proved?.simulationDone ? Number(proved.simulationDone.positionsUsed) : result?.positionsUsed;

  return (
    <ProveFrame
      locale={locale}
      action={
        <>
          <Button variant="primary" size="lg" loading={flow.busy} disabled={!result || loading || flow.busy} onClick={prove} onPointerEnter={preloadProve} onFocus={preloadProve}>
            {t.cta}
            <ArrowUpRight aria-hidden />
          </Button>
          <CostLine gasLimit={result ? proveScenarioGasLimit(result) : null} locale={locale} className="md:text-right" />
        </>
      }
      badges={
        result && positions !== undefined && proved ? (
          <>
            <Badge tone="safe" variant="outline" mono>
              {t.badgeTx({ ms: fmt.ms(proved.ms), positions: fmt.int(positions) })}
            </Badge>
            <span className="text-caption text-fg-3">{t.badgeTxNote}</span>
            <a
              href={txUrl(proved.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="group ml-auto inline-flex items-center gap-1 font-mono text-caption text-fg-2 hover:text-fg-1"
            >
              {t.open} · {proved.hash.slice(0, 6)}…{proved.hash.slice(-4)}
              <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
            </a>
          </>
        ) : (
          <PreviewBadges locale={locale} preview={preview} positions={positions} />
        )
      }
    >
      <TxProgress flow={flow.flow} outcome={proved ?? (out && out.status !== "confirmed" ? out : null)} locale={locale} />
      {dialog}
    </ProveFrame>
  );
}
