"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useCue } from "@/audio/use-cue";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Skeleton, SkeletonText } from "@/design/ui/skeleton";
import { StatusDot } from "@/design/ui/status-dot";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages, consoleNarrative } from "@/i18n/messages/console";
import { canClassify } from "@/lib/chain/book";
import type { PreviewError } from "@/lib/chain/engine-model";
import { usePositionMap } from "@/lib/chain/hooks/usePositionMap";
import { MONAD_TX_GAS_LIMIT } from "@/lib/chain/limits";
import { narrativeFacts } from "@/lib/chain/narrative";
import { calibratedScale, effectiveResolution, isCalibratedRun, oracleMode, resultFacts, symbolParts } from "@/lib/chain/scenario";
import { cascadeTimeline, type CascadeTimeline } from "@/lib/chain/timeline";
import type { Result, Scenario, Settings } from "@/lib/chain/types";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { whenScrollIntent } from "@/motion/scroll";
import { duration } from "@/motion/tokens";
import { PositionTiles, type PositionsInput } from "@/viz/position-tiles";
import type { InitialPreview } from "./data";
import { crossesLiquidation, narrativeText, priceLabel, settingsForScenario, shockLabel } from "./model";
import { useMountGate } from "./mount-gate";
import { StaticProvePanel } from "./prove-frame";
import { UsdMetric } from "./usd-metric";

export type PreviewState = {
  result: Result | null;
  error: PreviewError | null;
  loading: boolean;
  ms: number;
  resultScenario: Scenario | null;
};


/** Hidden bad debt under this is not worth a line (rounding on a few dust positions). */
const HIDDEN_MIN_USD = 1_000;
/**
 * The cascade timeline (its code and Motion's spring and presence engine) is a separate chunk, loaded
 * with the reader's first scroll, touch, press, key or mouse move. The server renders it in full; in
 * the browser it hydrates once the chunk is there. It sits below the first screen on every width, so
 * if React has to render it from scratch before that (a context above it changed first), the
 * same-height hold stands there meanwhile, out of sight.
 */
const WaveTimeline = lazy(() =>
  whenScrollIntent()
    .then(() => import("@/viz/wave-timeline"))
    .then((m) => ({ default: m.WaveTimeline })),
);

/** One block per beat while playing (a UI pace, not chain time). */
const BLOCK_MS = duration.slow;


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
    /** Someone has scrubbed or played this result. */
    moved: timeline !== null && scrub?.of === timeline,
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

/**
 * The main stage: context line, the two hero numbers, positions, the cascade, the story, the proof.
 * `initial` is the server's preview of the default scenario: while it is the result on screen, the
 * stage says which block it ran at and the first render has no entrance (it is the first paint).
 */
export function ResultStage({
  locale,
  settings,
  preview,
  initial = null,
}: {
  locale: Locale;
  settings: Settings;
  preview: PreviewState;
  initial?: InitialPreview | null;
}) {
  const t = consoleMessages[locale].stage;
  const fmt = formatters(locale);
  const { result, resultScenario, loading, error } = preview;
  const served = initial !== null && result !== null && result === initial.result ? initial : null;
  const engaged = useMountGate("intent");

  // Describe the result on screen, which can lag the inputs while a new preview loads.
  const shown = result && resultScenario ? settingsForScenario(resultScenario) : settings;
  const asset = DEPLOYMENT.assets[shown.assetId];
  const facts = result ? resultFacts(result, shown) : null;
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
  // Hidden bad debt comes from the per-position replay, which is shown only when it matches the
  // on-chain preview field by field (book.ts classifyPositions). Same read as the position tiles (cached).
  const map = usePositionMap(resultScenario, result);
  const hiddenUsd = map.classification?.consistent && !loading ? map.classification.hiddenBadDebtUsd : null;
  const shareCaption = (share: number | undefined) =>
    share === undefined ? undefined : `${t.share({ pct: fmt.pct(share) })}${facts?.scaled ? ` · ${t.scaled}` : ""}`;
  // `animate-rise` fills backwards (motion/tokens.css): no translate3d layer is left after the rise,
  // which at 1x DPR smeared the timeline's non-scaling-stroke ticks into a grey band.
  // The first result rises in (context, numbers, detail); the server's result is already there on the first paint.
  const beat = (b: "context" | "hero" | "detail") =>
    initial
      ? undefined
      : cn("motion-safe:animate-rise", b === "hero" && "[animation-delay:var(--beat-hero)]", b === "detail" && "[animation-delay:var(--beat-detail)]");
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
        {/* Where the result on screen was read: the server's pinned block, or this browser. One line either way (no shift). */}
        <p className="min-h-[1lh] font-mono text-caption text-fg-3">{served ? t.pinned({ block: fmt.block(served.blockNumber) }) : result ? t.browser : null}</p>
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
              still={served !== null && !engaged}
              label={t.badDebt}
              tone={facts && facts.badDebtUsd > 0 ? "liq" : "neutral"}
              value={facts?.badDebtUsd ?? null}
              caption={shareCaption(facts?.badDebtShare)}
              loadingLabel={t.loading}
              skeletonChars={6}
            />
            <p className="max-w-sm text-caption text-fg-3">{t.badDebtHelp}</p>
            {hiddenUsd !== null && hiddenUsd >= HIDDEN_MIN_USD && <p className="max-w-sm font-mono text-caption text-warn-hi">{t.hidden({ amount: fmt.usd(hiddenUsd) })}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <UsdMetric
              locale={locale}
              still={served !== null && !engaged}
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
          <CascadeReplay
            locale={locale}
            result={result}
            resultScenario={resultScenario}
            calibrated={calibrated}
            fallbackSteps={shown.steps}
            classification={served?.classification ?? null}
          />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section aria-labelledby="stage-narrative" className="flex flex-col gap-3">
              <Label as="h3" id="stage-narrative">
                {t.narrative}
              </Label>
              {narrative ? <p className="text-body text-fg-2">{narrative}</p> : <SkeletonText lines={4} className="text-body" />}
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
          <LazyProvePanel locale={locale} preview={preview} />
        </div>
      </div>
    </section>
  );
}

/**
 * Positions and the cascade timeline with their shared block playhead. The playhead state lives here,
 * so a replay frame or a scrub re-renders these two charts only, not the whole stage; and it is a memo,
 * so input edits that do not change the result on screen skip it.
 */
const CascadeReplay = memo(function CascadeReplay({
  locale,
  result,
  resultScenario,
  calibrated,
  fallbackSteps,
  classification,
}: {
  locale: Locale;
  result: Result | null;
  resultScenario: Scenario | null;
  calibrated: boolean;
  /** Blocks to draw while there is no result yet. */
  fallbackSteps: number;
  /** The server's classification of `result` (the initial preview): no book read in the browser. */
  classification: PositionsInput | null;
}) {
  const t = consoleMessages[locale].stage;
  const charts = consoleMessages[locale].charts;
  const fmt = formatters(locale);
  const timeline = useMemo(() => (result && resultScenario ? cascadeTimeline(result, resultScenario) : null), [result, resultScenario]);
  const steps = timeline ? timeline.points.length - 1 : fallbackSteps;
  const prices = useMemo(() => timeline?.points.map((p) => p.price), [timeline]);
  const replay = useReplay(timeline, steps);
  useReplayTick(timeline, replay.step);
  const read = usePositionMap(classification ? null : resultScenario, classification ? null : result);
  const positions = classification ? { classification, eligible: true, error: null } : read;
  const tilesExpected = resultScenario && canClassify(resultScenario) ? resultScenario.maxPositions : undefined;

  return (
    <>
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
            // The server's result is on screen from the first paint: its tiles do not tip in (the flips run once the playhead moves).
            className={classification && !replay.moved ? "[&_[data-state]>span]:animate-none" : undefined}
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
        <Suspense fallback={<div aria-hidden className="min-h-[33.5rem]" />}>
          <WaveTimeline
            timeline={timeline}
            step={replay.step}
            onStepChange={replay.seek}
            locale={INTL_LOCALE[locale]}
            formatUsd={fmt.usd}
            copy={charts.timeline}
          />
        </Suspense>
      </section>
    </>
  );
});

const ProvePanel = lazy(() => import("./prove-panel").then((m) => ({ default: m.ProvePanel })));

/**
 * The proof panel's flow code (cost confirmation dialog, progress, the action loader) loads with the
 * reader's first scroll, touch, press, key or mouse move; until then the same panel renders from
 * `StaticProvePanel` (also while the chunk loads). A press on its button loads the flow and starts it.
 */
function LazyProvePanel({ locale, preview }: { locale: Locale; preview: PreviewState }) {
  const engaged = useMountGate("intent");
  const [pressed, setPressed] = useState(false);
  const still = <StaticProvePanel locale={locale} preview={preview} onProve={() => setPressed(true)} />;
  return engaged || pressed ? (
    <Suspense fallback={still}>
      <ProvePanel locale={locale} preview={preview} startOnMount={pressed} />
    </Suspense>
  ) : (
    still
  );
}
