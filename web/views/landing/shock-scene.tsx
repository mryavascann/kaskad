"use client";

/**
 * Hero + pinned shock scene. One tall scroll track, a sticky viewport with the domino stage behind
 * the copy: the first scroll tips the first domino, the headline gives way to the shock panel (wave
 * counter, oracle price line, loop diagram) while a readout strip follows the replay block by block.
 * Everything replays the live preview the server read (`LandingFinding`, `LandingPositions`); with no
 * data the stage shows the neutral row and the panel says what is missing.
 *
 * Scroll progress: `useScrollProgress` (GSAP ScrollTrigger, loaded after hydration) → the stage's
 * MotionValue, CSS variables on the track (no re-render per frame), and React state only when the
 * whole block changes (at most `steps` renders over the scene). Reduced motion: progress jumps to 1,
 * the CSS module stacks everything statically and the stage keeps the final poster.
 */
import { useMotionValueEvent } from "motion/react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Skeleton } from "@/design/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages, type LandingMessages } from "@/i18n/messages/landing";
import { cn } from "@/lib/utils";
import { segment } from "@/motion/scroll";
import { useScrollProgress } from "@/motion/use-scroll-progress";
import { blockAt, type HeroTimeline } from "@/three/data";
import { HeroStage } from "@/three/hero-stage";
import type { LandingFinding, LandingPositions, LandingWave } from "./data";
import styles from "./shock-scene.module.css";

/** Beats of the scene, as fractions of the scroll track. */
export const BEATS = {
  introOut: [0.015, 0.13],
  panelIn: [0.11, 0.19],
  loop: [0.2, 0.62],
} as const;

type Props = {
  locale: Locale;
  finding: LandingFinding | null;
  positions: LandingPositions | null;
  placeholderCount: number;
  /** The server-rendered headline block (SplitText, live finding, CTAs). */
  intro: ReactNode;
};

/** The replay state at one whole block, derived from the recorded preview only. */
export function replayAt(finding: LandingFinding, positions: LandingPositions | null, block: number) {
  const k = Math.max(0, Math.min(finding.steps, Math.floor(block)));
  const price = finding.prices[k] ?? finding.finalPrice;
  const waves = finding.waves.filter((w) => w.step <= k);
  const under = positions ? positions.crossBlocks.filter((b) => b !== null && b <= k).length : null;
  const lastWaveStep = finding.waves.length ? finding.waves[finding.waves.length - 1].step : 0;
  return {
    block: k,
    price,
    drop: finding.startPrice > 0 ? 1 - price / finding.startPrice : 0,
    waves,
    latest: waves.length ? waves[waves.length - 1] : null,
    liquidatedUsd: waves.reduce((s, w) => s + w.liquidatedUsd, 0),
    under,
    /**
     * Liquidations stopped and debt stays stuck: said once the run is well past its last wave (two
     * blocks later, and not before 70 % of the path), while positions keep crossing the threshold.
     */
    stalled: finding.stuckDebtUsd > 0 && k >= Math.min(finding.steps, Math.max(lastWaveStep + 2, Math.ceil(finding.steps * 0.7))),
  };
}

function fallbackTimeline(f: LandingFinding): HeroTimeline {
  return { steps: f.steps, shockBps: Math.round(f.shock * 10_000), startBlock: 0, endBlock: f.steps };
}

export function ShockScene({ locale, finding, positions, placeholderCount, intro }: Props) {
  const t = landingMessages[locale];
  const track = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(track, { start: "top top", end: "bottom bottom" });
  const timeline = positions?.hero.timeline ?? (finding ? fallbackTimeline(finding) : null);
  const [block, setBlock] = useState(() => (timeline ? Math.floor(blockAt(timeline, 0) + 1e-9) : 0));
  const [introGone, setIntroGone] = useState(false);
  const [panelOn, setPanelOn] = useState(false);

  useMotionValueEvent(progress, "change", (p) => {
    const node = track.current;
    if (node) {
      node.style.setProperty("--intro", (1 - segment(p, ...BEATS.introOut)).toFixed(4));
      node.style.setProperty("--panel", segment(p, ...BEATS.panelIn).toFixed(4));
      node.style.setProperty("--loop", segment(p, ...BEATS.loop).toFixed(4));
    }
    setIntroGone(p >= BEATS.introOut[1]);
    setPanelOn(p > BEATS.panelIn[0]);
    if (timeline) setBlock(Math.floor(blockAt(timeline, p) + 1e-9));
  });

  return (
    <div ref={track} className={styles.track} data-landing-shock="">
      <div className={styles.viewport}>
        <div className={styles.stage}>
          <HeroStage className="absolute inset-0" positions={positions?.hero.positions} progress={progress} placeholderCount={placeholderCount} />
        </div>
        <div aria-hidden className={styles.scrim} />
        <div aria-hidden className={styles.scrimTop} />
        <div className={cn(styles.intro, introGone && styles.introHidden)}>{intro}</div>
        <section
          aria-labelledby="shock-title"
          className={styles.panel}
          data-visible={panelOn ? "" : undefined}
          aria-hidden={panelOn ? undefined : true}
          inert={!panelOn ? true : undefined}
          data-landing-panel=""
        >
          <ShockPanel locale={locale} t={t} finding={finding} positions={positions} block={block} />
        </section>
        <div className={styles.strip}>
          <ReplayStrip locale={locale} t={t} finding={finding} positions={positions} block={block} />
        </div>
      </div>
    </div>
  );
}

function ShockPanel({ locale, t, finding, positions, block }: { locale: Locale; t: LandingMessages; finding: LandingFinding | null; positions: LandingPositions | null; block: number }) {
  const fmt = formatters(locale);
  const s = t.shock;
  return (
    <div className="page-shell flex h-full flex-col justify-start pt-5 pb-32 sm:pt-8 lg:justify-center lg:pt-0 lg:pb-24">
      <div className="flex max-w-lg flex-col gap-4 sm:gap-5 lg:gap-6">
        <p className="label-mono text-warn">{s.kicker}</p>
        <h2 id="shock-title" className="text-title-2 text-fg-1 sm:text-title-1">
          {finding
            ? s.title({ asset: finding.symbol, shock: fmt.drop(finding.shock, 0), steps: fmt.int(finding.steps) })
            : s.kicker}
        </h2>
        {finding ? (
          <>
            <WaveCounter locale={locale} t={t} finding={finding} positions={positions} block={block} />
            <PriceLine locale={locale} t={t} finding={finding} block={block} />
            <LoopDiagram t={t} />
          </>
        ) : (
          <p className="text-body text-fg-2">{s.missing}</p>
        )}
      </div>
    </div>
  );
}

function waveLine(t: LandingMessages, fmt: ReturnType<typeof formatters>, w: LandingWave) {
  const v = { block: fmt.int(w.step), count: fmt.int(w.liquidations), liquidated: fmt.usd(w.liquidatedUsd) };
  return w.liquidations === 1 ? t.shock.waveLine(v) : t.shock.waveLinePlural(v);
}

function WaveCounter({ locale, t, finding, positions, block }: { locale: Locale; t: LandingMessages; finding: LandingFinding; positions: LandingPositions | null; block: number }) {
  const fmt = formatters(locale);
  const r = replayAt(finding, positions, block);
  const shown = finding.waves.slice(0, 12);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={cn("font-mono", r.latest ? "text-metric-md text-liq-hi sm:text-metric-lg" : "text-body text-fg-3")}>
          {r.latest ? t.shock.wave({ n: fmt.int(r.latest.n) }) : t.shock.noWave}
        </span>
        {r.latest && <span className="font-mono text-caption text-fg-2">{waveLine(t, fmt, r.latest)}</span>}
      </div>
      {shown.length > 1 && (
        <ol className="hidden flex-wrap gap-1.5 sm:flex" aria-label={t.hud.waves}>
          {shown.map((w) => {
            const on = w.step <= r.block;
            return (
              <li
                key={w.n}
                className={cn(
                  "rounded-tag border px-2 py-0.5 font-mono text-caption transition-colors duration-(--dur-base)",
                  on ? "border-liq/60 bg-liq/12 text-liq-hi" : "border-line-2 text-fg-3",
                )}
              >
                {t.shock.wave({ n: fmt.int(w.n) })} · {t.hud.block} {fmt.int(w.step)}
              </li>
            );
          })}
        </ol>
      )}
      {positions && r.under !== null && (
        <p className={cn("text-caption text-fg-2 transition-opacity duration-(--dur-slow) sm:text-body-sm", r.stalled ? "opacity-100" : "opacity-0 motion-reduce:opacity-100")}>
          {t.shock.stalled({
            under: fmt.int(r.under),
            total: fmt.int(positions.total),
          })}
        </p>
      )}
    </div>
  );
}

/** Oracle price per block, drawn up to the current block; y spans the run's own price range. */
function PriceLine({ locale, t, finding, block }: { locale: Locale; t: LandingMessages; finding: LandingFinding; block: number }) {
  const fmt = formatters(locale);
  const prices = finding.prices;
  const n = prices.length - 1;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const pad = 0.12;
  const y = (p: number) => Math.round((pad + (1 - pad * 2) * (1 - (p - lo) / span)) * 1000) / 1000;
  const x = (k: number) => (n > 0 ? k / n : 0);
  const points = prices.map((p, k) => `${Math.round(x(k) * 2000) / 10},${Math.round(y(p) * 600) / 10}`).join(" ");
  const k = Math.max(0, Math.min(n, block));
  const vars = { "--x": String(Math.round(x(k) * 10_000) / 10_000), "--y": String(y(prices[k])) } as CSSProperties;
  const waveSteps = new Set(finding.waves.map((w) => w.step));

  return (
    <figure className="flex flex-col gap-2" aria-label={t.shock.priceLabel}>
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="label-mono text-fg-3">{t.shock.priceLabel}</span>
        <span className="font-mono text-caption text-fg-2">
          ${fmt.num(prices[k], 4)} <span className="text-warn">{fmt.drop(1 - prices[k] / (prices[0] || 1), 1)}</span>
        </span>
      </figcaption>
      <div className="relative h-12 w-full sm:h-20" style={vars} aria-hidden>
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <line x1="0" y1="59.5" x2="200" y2="59.5" stroke="var(--color-line-2)" vectorEffect="non-scaling-stroke" />
          <polyline points={points} fill="none" stroke="var(--color-line-3)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        </svg>
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" className={cn("absolute inset-0 size-full overflow-visible", styles.reveal)}>
          <polyline points={points} fill="none" stroke="var(--color-warn)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {prices.map((p, i) =>
            waveSteps.has(i) ? (
              <line key={i} x1={Math.round(x(i) * 2000) / 10} x2={Math.round(x(i) * 2000) / 10} y1="0" y2="60" stroke="var(--color-liq)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ) : null,
          )}
        </svg>
        <div className={styles.needleX}>
          <div className={styles.needleY}>
            <span className="absolute top-0 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warn shadow-glow-warn" />
          </div>
        </div>
      </div>
    </figure>
  );
}

function LoopDiagram({ t }: { t: LandingMessages }) {
  const steps = t.shock.loop;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="label-mono text-fg-3">{t.shock.loopLabel}</figcaption>
      <div className="relative">
        <ol className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 sm:gap-2">
          {steps.map((step, i) => (
            <li key={step} className="contents">
              <span
                className={cn(
                  "rounded-control border px-2 py-2 text-center text-caption leading-tight sm:px-3 sm:text-body-sm",
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
          <path
            d="M 83 0 V 6 Q 83 9 80 9 H 20 Q 17 9 17 6 V 0"
            pathLength={1}
            fill="none"
            stroke="var(--color-liq)"
            strokeWidth="1.25"
            className={styles.loopReturn}
          />
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

function ReplayStrip({ locale, t, finding, positions, block }: { locale: Locale; t: LandingMessages; finding: LandingFinding | null; positions: LandingPositions | null; block: number }) {
  const fmt = formatters(locale);
  const r = finding ? replayAt(finding, positions, block) : null;
  const items: [string, string | null, string?][] = [
    [t.hud.block, r && finding ? `${fmt.int(r.block).padStart(2, "0")}/${fmt.int(finding.steps)}` : null],
    [t.hud.price, r ? `$${fmt.num(r.price, 4)}` : null],
    [t.hud.drop, r ? fmt.drop(r.drop, 1) : null, "text-warn"],
    [t.hud.waves, r ? fmt.int(r.waves.length) : null, r && r.waves.length ? "text-liq-hi" : undefined],
    [t.hud.under, r && r.under !== null && positions ? `${fmt.int(r.under)}/${fmt.int(positions.total)}` : null],
    [t.hud.liquidated, r ? fmt.usd(r.liquidatedUsd) : null],
  ];
  return (
    <div className="border-t border-line-2 bg-bg/80 backdrop-blur-md">
      <dl aria-label={t.hud.label} className="page-shell grid grid-cols-3 gap-x-4 gap-y-2 py-3 sm:grid-cols-6 sm:py-4">
        {items.map(([label, value, tone]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="label-mono leading-tight text-fg-3">{label}</dt>
            <dd className={cn("font-mono text-body-sm tabular-nums text-fg-1", tone)}>
              {value ?? <Skeleton className="inline-block h-[1lh] w-12 align-middle" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
