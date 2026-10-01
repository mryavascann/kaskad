/**
 * Hero + pinned shock scene, server-rendered. One tall scroll track, a sticky viewport with the
 * domino stage behind the copy: the first scroll tips the first domino, the headline gives way to
 * the shock panel (wave counter, oracle price line, loop diagram) while a readout strip follows the
 * replay block by block. Everything replays the live preview the server read (`LandingFinding`,
 * `LandingPositions`); with no data the stage shows the neutral row and the panel says what is missing.
 *
 * What runs in the browser, and when:
 * - `ShockDriver` (the only eager client code, renders nothing): after the reader's first intent it
 *   follows the track's scroll progress and writes CSS variables, the panel's visibility and the
 *   scene state (`scene-state.ts`), with no React render per frame.
 * - Islands (`scene-islands.tsx`): until that same intent they show the server's first frame (the
 *   static poster, the readouts at the first block); then they load the live stage (`HeroStage`:
 *   poster, then the WebGL scene) and the readouts that re-render per whole block.
 * The headline block (`intro`), the panel's title and the loop diagram are server HTML only.
 *
 * Reduced motion: the driver jumps to the final state and loads the islands at once; the CSS module
 * stacks everything statically and the stage keeps the final poster.
 */
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages, type LandingMessages } from "@/i18n/messages/landing";
import { cn } from "@/lib/utils";
import type { HeroTimeline } from "@/three/data";
import { HeroPoster } from "@/three/hero-poster";
import type { LandingFinding, LandingPositions } from "./data";
import { replayBook } from "./replay";
import { LivePriceLine, LiveReplayStrip, LiveStage, LiveWaveCounter } from "./scene-islands";
import { blockAtProgress } from "./scene-state";
import { ShockDriver } from "./shock-driver";
import { PriceLineView, ReplayStripView, WaveCounterView } from "./shock-readouts";
import styles from "./shock-scene.module.css";

export { BEATS, replayAt, waveCue } from "./replay";

/** The track's id: the driver finds the server-rendered scene by it. */
export const SHOCK_TRACK_ID = "landing-shock";

type Props = {
  locale: Locale;
  finding: LandingFinding | null;
  positions: LandingPositions | null;
  placeholderCount: number;
  /** The server-rendered headline block (SplitText, live finding, CTAs). */
  intro: ReactNode;
};

function fallbackTimeline(f: LandingFinding): HeroTimeline {
  return { steps: f.steps, shockBps: Math.round(f.shock * 10_000), startBlock: 0, endBlock: f.steps };
}

export function ShockScene({ locale, finding, positions, placeholderCount, intro }: Props) {
  const t = landingMessages[locale];
  const timeline = positions?.hero.timeline ?? (finding ? fallbackTimeline(finding) : null);
  const initialBlock = timeline ? blockAtProgress(timeline, 0) : 0;
  const book = replayBook(positions);

  return (
    <div id={SHOCK_TRACK_ID} className={styles.track} data-landing-shock="">
      <ShockDriver trackId={SHOCK_TRACK_ID} timeline={timeline} />
      <div className={styles.viewport}>
        <div className={styles.stage}>
          {/* The first frame as static server HTML; the live stage replaces it after the first intent. */}
          <div aria-hidden data-stage-poster="" className="absolute inset-0 isolate overflow-hidden bg-void">
            <HeroPoster positions={positions?.hero.positions} progress={0} placeholderCount={placeholderCount} />
          </div>
          <LiveStage positions={positions?.hero.positions} placeholderCount={placeholderCount} timeline={positions?.hero.timeline ?? null} />
        </div>
        <div aria-hidden className={styles.scrim} />
        <div aria-hidden className={styles.scrimTop} />
        <div className={styles.intro}>{intro}</div>
        <section aria-labelledby="shock-title" className={styles.panel} aria-hidden inert data-landing-panel="">
          <ShockPanel locale={locale} t={t} finding={finding} book={book} initialBlock={initialBlock} />
        </section>
        <div className={styles.strip}>
          <LiveReplayStrip locale={locale} finding={finding} book={book} initialBlock={initialBlock}>
            <ReplayStripView locale={locale} finding={finding} book={book} block={initialBlock} />
          </LiveReplayStrip>
        </div>
      </div>
    </div>
  );
}

function ShockPanel({
  locale,
  t,
  finding,
  book,
  initialBlock,
}: {
  locale: Locale;
  t: LandingMessages;
  finding: LandingFinding | null;
  book: ReturnType<typeof replayBook>;
  initialBlock: number;
}) {
  const fmt = formatters(locale);
  const s = t.shock;
  return (
    <div className="page-shell flex h-full flex-col justify-start pt-5 pb-32 sm:pt-8 lg:justify-center lg:pt-0 lg:pb-24">
      <div className="flex max-w-lg flex-col gap-4 sm:gap-5 lg:gap-6">
        <p className="label-mono text-warn">{s.kicker}</p>
        <h2 id="shock-title" className="text-title-2 text-fg-1 sm:text-title-1">
          {finding ? s.title({ asset: finding.symbol, shock: fmt.drop(finding.shock, 0), steps: fmt.int(finding.steps) }) : s.kicker}
        </h2>
        {finding ? (
          <>
            <LiveWaveCounter locale={locale} finding={finding} book={book} initialBlock={initialBlock}>
              <WaveCounterView locale={locale} finding={finding} book={book} block={initialBlock} />
            </LiveWaveCounter>
            <LivePriceLine locale={locale} finding={finding} initialBlock={initialBlock}>
              <PriceLineView locale={locale} finding={finding} block={initialBlock} />
            </LivePriceLine>
            <LoopDiagram t={t} />
          </>
        ) : (
          <p className="text-body text-fg-2">{s.missing}</p>
        )}
      </div>
    </div>
  );
}

/** The feedback loop, on its own backplate so the domino row never shows through it. Pure CSS: `--loop` draws it. */
function LoopDiagram({ t }: { t: LandingMessages }) {
  const steps = t.shock.loop;
  return (
    <figure className="flex flex-col gap-3 rounded-panel border border-line-2 bg-bg/85 p-3 backdrop-blur-sm sm:p-4" data-landing-loop="">
      <figcaption className="label-mono text-fg-3">{t.shock.loopLabel}</figcaption>
      <div className="relative">
        <ol className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-1.5 sm:gap-2">
          {steps.map((step, i) => (
            <li key={step} className="contents">
              <span
                className={cn(
                  "flex items-center justify-center rounded-control border px-2 py-2 text-center text-caption leading-tight sm:px-3 sm:text-body-sm",
                  i === 2 ? "border-liq/55 bg-liq/10 text-liq-hi" : "border-line-3 bg-elev-1/80 text-fg-1",
                  styles.loopStep,
                )}
                style={{ "--i": i } as CSSProperties}
              >
                {step}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden className="flex w-4 items-center sm:w-6">
                  <span className={cn("h-px flex-1 bg-fg-3", styles.loopLink)} style={{ "--i": i + 1 } as CSSProperties} />
                  <span className={cn("-ml-1 text-caption text-fg-3", styles.loopStep)} style={{ "--i": i + 1 } as CSSProperties}>
                    ›
                  </span>
                </span>
              )}
            </li>
          ))}
        </ol>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-1 h-4 w-full overflow-visible" aria-hidden>
          <path d="M 83 0 V 6 Q 83 9 80 9 H 20 Q 17 9 17 6 V 0" pathLength={1} fill="none" stroke="var(--color-liq)" strokeWidth="1.25" className={styles.loopReturn} />
        </svg>
      </div>
      <p className={cn("flex items-center justify-center gap-2 label-mono text-liq-hi", styles.loopAgain)}>
        <span aria-hidden>↺</span>
        {t.shock.again}
      </p>
      <p className="hidden text-caption text-fg-3 sm:block">{t.shock.loopNote}</p>
    </figure>
  );
}
