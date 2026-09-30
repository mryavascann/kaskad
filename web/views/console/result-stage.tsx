"use client";

import { ArrowUpRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useCue } from "@/audio/use-cue";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Metric, type MetricFormat } from "@/design/ui/metric";
import { Panel } from "@/design/ui/panel";
import { Skeleton, SkeletonText } from "@/design/ui/skeleton";
import { StatusDot } from "@/design/ui/status-dot";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { formatters, usdParts } from "@/i18n/format";
import { consoleMessages, consoleNarrative } from "@/i18n/messages/console";
import { proveScenario, proveScenarioGasLimit, type ProveScenarioOutcome } from "@/lib/chain/actions/proveScenario";
import { canClassify } from "@/lib/chain/book";
import type { PreviewError } from "@/lib/chain/engine";
import { usePositionMap } from "@/lib/chain/hooks/usePositionMap";
import { MONAD_TX_GAS_LIMIT } from "@/lib/chain/limits";
import { narrativeFacts } from "@/lib/chain/narrative";
import { calibratedScale, effectiveResolution, isCalibratedRun, oracleMode, resultFacts, symbolParts } from "@/lib/chain/scenario";
import { cascadeTimeline, type CascadeTimeline } from "@/lib/chain/timeline";
import type { Result, Scenario, Settings } from "@/lib/chain/types";
import { DEPLOYMENT, txUrl } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { duration } from "@/motion/tokens";
import { PositionTiles } from "@/viz/position-tiles";
import { WaveTimeline } from "@/viz/wave-timeline";
import { CostLine, TxProgress, useConfirmCost, useTxFlow } from "../shared/tx/tx-parts";
import { crossesLiquidation, narrativeText, priceLabel, settingsForScenario, shockLabel } from "./model";

export type PreviewState = {
  result: Result | null;
  error: PreviewError | null;
  loading: boolean;
  ms: number;
  resultScenario: Scenario | null;
};

/** One block per beat while playing (a UI pace, not chain time). */
const BLOCK_MS = duration.slow;

function UsdMetric({ value, locale, ...props }: Omit<ComponentProps<typeof Metric>, "value" | "prefix" | "suffix" | "format" | "locales"> & { value: number | null; locale: Locale }) {
  const p = value === null ? null : usdParts(value, locale);
  return <Metric value={p?.value ?? null} prefix={p?.prefix} suffix={p?.suffix} format={p?.format as MetricFormat | undefined} locales={p?.locales} {...props} />;
}

/** Block playhead shared by the timeline and the tiles: the end state until someone scrubs or plays. */
function useReplay(timeline: object | null, steps: number) {
  const [scrub, setScrub] = useState<{ of: object; step: number } | null>(null);
  const [playing, setPlaying] = useState<object | null>(null);
  const step = timeline && scrub?.of === timeline ? scrub.step : steps;
  const running = timeline !== null && playing === timeline && step < steps;

  useEffect(() => {
    if (!running || !timeline) return;
    const id = setInterval(() => {
      setScrub((s) => ({ of: timeline, step: Math.min(steps, (s?.of === timeline ? s.step : steps) + 1) }));
    }, BLOCK_MS);
    return () => clearInterval(id);
  }, [running, timeline, steps]);

  return {
    step,
    running,
    seek: (next: number) => {
      if (!timeline) return;
      setPlaying(null);
      setScrub({ of: timeline, step: next });
    },
    play: () => {
      if (!timeline) return;
      if (step >= steps) setScrub({ of: timeline, step: 0 });
      setPlaying(timeline);
    },
    pause: () => setPlaying(null),
  };
}

/** `cue("tick")` when the playhead (playing or scrubbed) passes a block with liquidations; silent on a new result. */
function useReplayTick(timeline: CascadeTimeline | null, step: number) {
  const cue = useCue();
  const prev = useRef<{ of: CascadeTimeline | null; step: number }>({ of: timeline, step });
  useEffect(() => {
    const from = prev.current;
    prev.current = { of: timeline, step };
    if (timeline && from.of === timeline && crossesLiquidation(timeline.points, from.step, step)) cue("tick");
  }, [timeline, step, cue]);
}

/** The main stage: context line, the two hero numbers, positions, the cascade, the story, the proof. */
export function ResultStage({ locale, settings, preview }: { locale: Locale; settings: Settings; preview: PreviewState }) {
  const t = consoleMessages[locale].stage;
  const charts = consoleMessages[locale].charts;
  const fmt = formatters(locale);
  const { result, resultScenario, loading, error } = preview;

  // Describe the result on screen, which can lag the inputs while a new preview loads.
  const shown = result && resultScenario ? settingsForScenario(resultScenario) : settings;
  const asset = DEPLOYMENT.assets[shown.assetId];
  const facts = result ? resultFacts(result, shown) : null;
  const timeline = useMemo(() => (result && resultScenario ? cascadeTimeline(result, resultScenario) : null), [result, resultScenario]);
  const steps = timeline ? timeline.points.length - 1 : shown.steps;
  const prices = useMemo(() => timeline?.points.map((p) => p.price), [timeline]);
  const replay = useReplay(timeline, steps);
  useReplayTick(timeline, replay.step);
  const positions = usePositionMap(resultScenario, result);
  const narrative = result && asset ? consoleNarrative[locale](narrativeText(narrativeFacts(result, asset, shown, calibratedScale(shown, result)), fmt)) : null;

  const calibrated = isCalibratedRun(shown);
  const context = asset
    ? t.context({
        symbol: symbolParts(asset).base,
        shock: shockLabel(shown.shockPct, fmt),
        oracle: t.contextOracle[oracleMode(shown.feedback)],
        book: t.contextBook({ kind: calibrated ? "calibrated" : "real", n: fmt.int(calibrated ? effectiveResolution(shown) : asset.realPositions) }),
        steps: consoleMessages[locale].inputs.stepsValue({ n: fmt.int(shown.steps) }),
      })
    : "";
  const status = error ? "error" : loading || !result ? "loading" : "ready";
  const expectedTiles = resultScenario ?? null;
  const tilesExpected = expectedTiles && canClassify(expectedTiles) ? expectedTiles.maxPositions : undefined;
  const shareCaption = (share: number | undefined) =>
    share === undefined ? undefined : `${t.share({ pct: fmt.pct(share) })}${facts?.scaled ? ` · ${t.scaled}` : ""}`;
  const beat = (b: "context" | "hero" | "detail") => cn("motion-safe:animate-rise", b === "hero" && "[animation-delay:var(--beat-hero)]", b === "detail" && "[animation-delay:var(--beat-detail)]");
  const ready = result !== null;

  return (
    <section aria-labelledby="stage-title" aria-busy={loading || undefined} className="flex min-w-0 flex-col gap-8">
      <header key={ready ? "ready" : "wait"} className={cn("flex flex-col gap-2", beat("context"))}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label as="h2" id="stage-title">
            {t.title}
          </Label>
          <span className="flex items-center gap-2 font-mono text-caption text-fg-2">
            <StatusDot tone={status === "error" ? "liq" : status === "ready" ? "safe" : "monad"} pulse={status === "loading"} />
            {t.status[status]}
          </span>
        </div>
        <p className="font-mono text-body-sm text-fg-1">{context}</p>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {facts && !loading ? t.announce({ bad: fmt.usd(facts.badDebtUsd), stuck: fmt.usd(facts.stuckDebtUsd) }) : ""}
        </p>
      </header>

      {error && (
        <Callout tone="liq" title={error.code === "out-of-gas" ? t.outOfGasTitle : t.errorTitle}>
          {error.code === "out-of-gas" ? t.outOfGasBody({ limit: fmt.gas(MONAD_TX_GAS_LIMIT) }) : t.errorBody}
        </Callout>
      )}

      <div className={cn("flex flex-col gap-10 transition-opacity duration-(--dur-base) ease-out-quart", loading && ready && "opacity-60")}>
        <div key={ready ? "ready" : "wait"} className={cn("grid gap-x-8 gap-y-6 border-y border-line py-6 sm:grid-cols-2", beat("hero"))}>
          <div className="flex flex-col gap-2">
            <UsdMetric
              locale={locale}
              size="xl"
              label={t.badDebt}
              tone={facts && facts.badDebtUsd > 0 ? "liq" : "neutral"}
              value={facts?.badDebtUsd ?? null}
              caption={shareCaption(facts?.badDebtShare)}
              loadingLabel={t.loading}
              skeletonChars={6}
            />
            <p className="max-w-sm text-caption text-fg-3">{t.badDebtHelp}</p>
          </div>
          <div className="flex flex-col gap-2">
            <UsdMetric
              locale={locale}
              size="xl"
              label={t.stuck}
              tone={facts && facts.stuckDebtUsd > 0 ? "warn" : "neutral"}
              value={facts?.stuckDebtUsd ?? null}
              caption={shareCaption(facts?.stuckDebtShare)}
              loadingLabel={t.loading}
              skeletonChars={7}
            />
            <p className="max-w-sm text-caption text-fg-3">{t.stuckHelp}</p>
          </div>
        </div>

        <div key={`d-${ready ? "ready" : "wait"}`} className={cn("flex flex-col gap-10", beat("detail"))}>
          <section aria-labelledby="stage-positions" className="flex flex-col gap-4">
            <Label as="h3" id="stage-positions">
              {t.positions}
            </Label>
            {result && !positions.eligible ? (
              <p className="rounded-control border border-dashed border-line-2 px-4 py-3 text-body-sm text-fg-2">
                {calibrated ? t.positionsCalibrated : t.positionsTooLarge}
              </p>
            ) : (
              <PositionTiles
                classification={positions.classification}
                expectedCount={tilesExpected}
                step={replay.step}
                steps={steps}
                prices={prices}
                error={positions.error ?? undefined}
                locale={INTL_LOCALE[locale]}
                formatUsd={fmt.usd}
                copy={charts.positions}
              />
            )}
          </section>

          <section aria-labelledby="stage-timeline" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label as="h3" id="stage-timeline">
                {t.timeline}
              </Label>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" disabled={!timeline} onClick={() => (replay.running ? replay.pause() : replay.play())}>
                  {replay.running ? <Pause aria-hidden /> : <Play aria-hidden />}
                  {replay.running ? t.pause : replay.step >= steps ? t.replay : t.play}
                </Button>
                <Button size="sm" variant="ghost" disabled={!timeline} onClick={() => replay.seek(0)}>
                  <RotateCcw aria-hidden />
                  {t.toStart}
                </Button>
              </div>
            </div>
            <WaveTimeline
              timeline={timeline}
              step={replay.step}
              onStepChange={replay.seek}
              locale={INTL_LOCALE[locale]}
              formatUsd={fmt.usd}
              copy={charts.timeline}
            />
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section aria-labelledby="stage-narrative" className="flex flex-col gap-3">
              <Label as="h3" id="stage-narrative">
                {t.narrative}
              </Label>
              {narrative ? (
                <p className="text-body text-fg-2">{narrative}</p>
              ) : (
                <SkeletonText lines={4} className="text-body" />
              )}
            </section>
            <section aria-labelledby="stage-stats" className="flex flex-col gap-3">
              <Label as="h3" id="stage-stats">
                {t.stats}
              </Label>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line-2 bg-line">
                {(
                  [
                    [t.liquidated, facts ? fmt.usd(facts.liquidatedUsd) : null, undefined, undefined],
                    [t.totalDebt, facts ? fmt.usd(facts.totalDebtUsd) : null, facts?.scaled ? t.scaled : undefined, undefined],
                    [
                      t.liquidations,
                      facts ? fmt.int(facts.liquidations) : null,
                      facts ? t.liquidationsValue({ liquidations: fmt.int(facts.liquidations), waves: fmt.int(facts.rounds) }) : undefined,
                      undefined,
                    ],
                    [
                      t.finalPrice,
                      facts ? priceLabel(facts.finalPrice, fmt) : null,
                      facts ? t.finalPriceCaption({ drop: fmt.drop(facts.priceDrop) }) : undefined,
                      facts?.priceHalved ? "liq" : undefined,
                    ],
                  ] as [string, string | null, string | undefined, "liq" | undefined][]
                ).map(([label, value, caption, tone]) => (
                  <div key={label} className="flex min-w-0 flex-col gap-1.5 bg-elev-1 px-4 py-3.5">
                    <Label as="p">{label}</Label>
                    <p aria-busy={value === null || undefined} className={cn("font-mono text-metric-sm", tone === "liq" ? "text-liq-hi" : "text-fg-1")}>
                      {value ?? (
                        <span className="flex h-[1lh] items-center">
                          <Skeleton className="h-[0.7em] w-20" />
                        </span>
                      )}
                    </p>
                    {caption && <p className="font-mono text-caption text-fg-3">{caption}</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <ProvePanel locale={locale} preview={preview} />
        </div>
      </div>
    </section>
  );
}

/** "Prove on chain": the badge (free preview, then the tx), the cost line, the flow. */
function ProvePanel({ locale, preview }: { locale: Locale; preview: PreviewState }) {
  const t = consoleMessages[locale].prove;
  const fmt = formatters(locale);
  const flow = useTxFlow<ProveScenarioOutcome>();
  const { confirm, dialog } = useConfirmCost(locale);
  const [provedKey, setProvedKey] = useState<string | null>(null);
  const { result, resultScenario, loading, ms } = preview;
  const key = resultScenario ? JSON.stringify(resultScenario) : null;

  const prove = async () => {
    if (!result || !resultScenario) return;
    setProvedKey(key);
    flow.start(["send", "confirm"]);
    const out = await proveScenario(resultScenario, result, { onEvent: flow.onEvent, confirm });
    flow.finish(out);
  };

  const out = flow.outcome;
  const cue = useCue();
  useEffect(() => {
    if (out?.status === "confirmed") cue("tick");
  }, [out, cue]);
  const proved = out?.status === "confirmed" && provedKey === key ? out : null;
  const positions = proved?.simulationDone ? Number(proved.simulationDone.positionsUsed) : result?.positionsUsed;

  return (
    <Panel as="section" aria-labelledby="prove-title" corners className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-lg flex-col gap-2">
          <h3 id="prove-title" className="text-title-3 text-fg-1">
            {t.title}
          </h3>
          <p className="text-body-sm text-fg-2">{t.body}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          <Button variant="primary" size="lg" loading={flow.busy} disabled={!result || loading || flow.busy} onClick={prove}>
            {t.cta}
            <ArrowUpRight aria-hidden />
          </Button>
          <CostLine gasLimit={result ? proveScenarioGasLimit(result) : null} locale={locale} className="md:text-right" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
        {result && positions !== undefined ? (
          proved ? (
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
            <>
              <Badge tone="monad" variant="outline" mono icon={null}>
                {t.badgePreview({ ms: fmt.ms(ms), positions: fmt.int(positions) })}
              </Badge>
              <span className="text-caption text-fg-3">{t.badgePreviewNote}</span>
            </>
          )
        ) : (
          <span className="text-caption text-fg-3" aria-busy>
            {t.waiting}
          </span>
        )}
      </div>
      <TxProgress flow={flow.flow} outcome={proved ?? (out && out.status !== "confirmed" ? out : null)} locale={locale} />
      {dialog}
    </Panel>
  );
}
