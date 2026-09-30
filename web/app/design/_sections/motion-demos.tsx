"use client";

/**
 * Interactive demos for the /design Motion section. Everything here reads its timing from
 * `motion/tokens.ts` and the maths from `motion/easing.ts` / `motion/spring.ts`; nothing is tuned by eye.
 * Rest states are complete (bars full, curves drawn) so the server markup is informative on its own;
 * a demo plays once when it scrolls into view and on Play / Replay.
 */
import { ArrowDown, PanelRight, Play, RotateCcw, Zap, type LucideIcon } from "lucide-react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Variants,
} from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Button, ButtonArrow } from "@/design/ui/button";
import { cn } from "@/lib/utils";
import { useDemoMode, useRandom } from "@/motion/demo-mode";
import { clamp, ease } from "@/motion/easing";
import { useFinePointer, useForcedReducedMotion, usePrefersReducedMotion, useShouldReduceMotion } from "@/motion/hooks";
import { Magnetic } from "@/motion/magnetic";
import { MotionProvider, ReducedMotionScope } from "@/motion/provider";
import { randomBetween } from "@/motion/random";
import { Reveal } from "@/motion/reveal";
import { SplitText } from "@/motion/split-text";
import { Spotlight } from "@/motion/spotlight";
import { springOvershoot, springPeakTime, springSettleTime, springStep } from "@/motion/spring";
import { Stagger, StaggerItem, type StaggerGap } from "@/motion/stagger";
import { beat, dampingRatio, distance, duration, easing, spring, stagger, toSeconds, transition } from "@/motion/tokens";

/* ------------------------------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------------------------------- */

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const noop = () => () => {};

/** False on the server and during hydration, true afterwards. For readouts the server cannot know. */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** A millisecond clock (a motion value) that runs 0 → `total` linearly on `play()`. Rests at `total`. */
function useClock(total: number) {
  const time = useMotionValue(total);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const play = useCallback(() => {
    controls.current?.stop();
    time.jump(0);
    controls.current = animate(time, total, { duration: toSeconds(total), ease: "linear" });
  }, [time, total]);
  useEffect(() => () => controls.current?.stop(), []);
  return { time, play };
}

/** Plays once, the first time the element scrolls into view. */
function useAutoplay(ref: RefObject<HTMLElement | null>, play: () => void) {
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  useEffect(() => {
    if (inView) play();
  }, [inView, play]);
}

function DemoFrame({
  title,
  detail,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <figure className={cn("flex min-w-0 flex-col rounded-panel border border-line-2 bg-elev-1 shadow-panel", className)}>
      <figcaption className="flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 sm:px-5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="label-mono text-fg-2">{title}</span>
          {detail && <span className="font-mono text-caption text-fg-3">{detail}</span>}
        </span>
        {actions && <span className="flex flex-wrap items-center gap-2">{actions}</span>}
      </figcaption>
      <div className={cn("min-w-0 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </figure>
  );
}

function ActionButton({
  onClick,
  what,
  label = "Replay",
  icon: Icon = RotateCcw,
  pressed,
}: {
  onClick: () => void;
  /** Completes the accessible name ("Replay stagger"), visually hidden. */
  what: string;
  label?: string;
  icon?: LucideIcon;
  pressed?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={onClick}
      aria-pressed={pressed}
      className="gap-1.5 px-2.5 aria-pressed:border-monad-hi/60 aria-pressed:bg-monad/12"
    >
      <Icon aria-hidden />
      {label}
      <span className="sr-only"> {what}</span>
    </Button>
  );
}

/** Tick-marked time axis, labels every `labelEvery` ms (every other one hidden on phones). */
function TimeAxis({ total, step, labelEvery, className, style }: { total: number; step: number; labelEvery: number; className?: string; style?: CSSProperties }) {
  const ticks = Array.from({ length: Math.round(total / step) + 1 }, (_, i) => i * step);
  return (
    <div aria-hidden className={cn("relative h-7", className)} style={style}>
      <div className="absolute inset-x-0 top-0 h-px bg-line-2" />
      {ticks.map((ms) => {
        const major = ms % labelEvery === 0;
        const edge = ms === 0 ? "left-0" : ms === total ? "right-0" : "-translate-x-1/2";
        return (
          <span key={ms} className="absolute top-0" style={{ left: `${(ms / total) * 100}%` }}>
            <span className={cn("absolute top-0 left-0 w-px -translate-x-1/2", major ? "h-2 bg-fg-4" : "h-1 bg-line-3")} />
            {major && (
              <span
                className={cn(
                  "absolute top-3 font-mono text-[0.6875rem] leading-none text-fg-3",
                  edge,
                  ms % (labelEvery * 2) !== 0 && "hidden sm:block",
                )}
              >
                {ms}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Lab: the reduced-motion switch and environment readout around every demo
 * ---------------------------------------------------------------------------------------------- */

function Switch({ pressed, onPressedChange, children }: { pressed: boolean; onPressedChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className="group/switch inline-flex h-9 shrink-0 items-center gap-2.5 rounded-control px-2 text-body-sm font-medium text-fg-1 transition-colors duration-(--dur-fast) ease-out-quart hover:bg-elev-2"
    >
      <span
        aria-hidden
        className="relative inline-flex h-5 w-9 items-center rounded-tag border border-line-strong bg-bg transition-colors duration-(--dur-fast) group-aria-pressed/switch:border-monad-hi/70 group-aria-pressed/switch:bg-monad/30"
      >
        <span className="absolute left-[3px] size-3 rounded-[2px] bg-fg-3 transition-[translate,background-color] duration-(--dur-fast) ease-out-quart group-aria-pressed/switch:translate-x-4 group-aria-pressed/switch:bg-fg-1 motion-reduce:transition-none" />
      </span>
      {children}
    </button>
  );
}

function Readout({ term, value, className }: { term: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <dt className="label-mono text-fg-3">{term}</dt>
      <dd className="font-mono text-caption text-fg-1">{value}</dd>
    </div>
  );
}

const Skeleton = ({ className }: { className?: string }) => <span aria-hidden className={cn("inline-block h-2.5 w-14 rounded-[2px] bg-elev-3", className)} />;

/**
 * Wraps the demos: MotionProvider (reducedMotion "user") plus a switch that forces reduced motion
 * on the whole subtree (Motion config, CSS travel variables and `data-motion`), so every demo can be
 * audited in both modes.
 */
export function MotionLab({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);
  const hydrated = useHydrated();
  const system = usePrefersReducedMotion();
  const fine = useFinePointer();
  const demo = useDemoMode();
  return (
    <MotionProvider>
      <div className="sticky top-[4.25rem] z-(--z-sticky) flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 rounded-panel border border-line-2 bg-bg/85 py-1.5 pr-4 pl-1.5 shadow-panel backdrop-blur-md">
        <Switch pressed={reduced} onPressedChange={setReduced}>
          Simulate reduced motion
        </Switch>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 sm:px-0">
          <Readout term="OS" value={hydrated ? (system ? "reduce" : "no preference") : <Skeleton />} />
          <Readout term="Pointer" value={hydrated ? (fine ? "fine" : "coarse") : <Skeleton className="w-8" />} className="hidden sm:flex" />
          <Readout term="Demo" value={hydrated ? (demo ? "on · seeded" : "off · ?demo=1") : <Skeleton />} className="hidden sm:flex" />
        </dl>
      </div>
      <ReducedMotionScope reduce={reduced} className="flex flex-col gap-16">
        {children}
      </ReducedMotionScope>
    </MotionProvider>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Durations
 * ---------------------------------------------------------------------------------------------- */

const DURATIONS = [
  { name: "instant", use: "Focus, state flips" },
  { name: "fast", use: "Hover, press" },
  { name: "base", use: "Default, fades" },
  { name: "slow", use: "Entrances" },
  { name: "sceneShort", use: "Short scenes" },
  { name: "scene", use: "Scene default" },
  { name: "sceneLong", use: "Long scenes" },
] as const satisfies readonly { name: keyof typeof duration; use: string }[];

const TIMELINE = duration.sceneLong;

function DurationRow({ name, use, row, time, reduce }: { name: keyof typeof duration; use: string; row: number; time: MotionValue<number>; reduce: boolean }) {
  const ms = duration[name];
  // Every bar fills at the same speed (its width is proportional to its duration), so the fills
  // run under one shared playhead and stop at their own end. Reduced motion: each bar fades in
  // when its duration has elapsed instead.
  const x = useTransform(time, (t) => (reduce ? "0%" : `${(clamp(t / ms) - 1) * 100}%`));
  const opacity = useTransform(time, (t) => (reduce && t < ms ? 0 : 1));
  return (
    <>
      <div className="col-start-1 min-w-0" style={{ gridRow: row }}>
        <p className="label-mono truncate text-fg-1">{kebab(name)}</p>
        <p className="hidden truncate text-caption text-fg-3 sm:block">{use}</p>
      </div>
      <div className="col-start-2 min-w-0" style={{ gridRow: row }}>
        <div
          className="relative h-7 overflow-hidden rounded-[3px] border border-line-2 bg-bg"
          style={{
            width: `${(ms / TIMELINE) * 100}%`,
            backgroundImage: "linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
            backgroundSize: `${(100 / ms) * 100}% 100%`,
          }}
        >
          <motion.div
            className="absolute inset-0 border-r border-fg-1 bg-fg-1/10 transition-opacity duration-(--dur-fast) ease-out-quart"
            style={{ x, opacity }}
          />
        </div>
      </div>
      <p className="col-start-3 text-right font-mono text-caption whitespace-nowrap text-fg-1 sm:text-body-sm" style={{ gridRow: row }}>
        {ms}
        <span className="text-fg-3"> ms</span>
      </p>
    </>
  );
}

export function DurationsDemo() {
  const { time, play } = useClock(TIMELINE);
  const ref = useRef<HTMLDivElement>(null);
  useAutoplay(ref, play);
  const reduce = useShouldReduceMotion();
  const elapsed = useTransform(time, (t) => `${String(Math.round(t)).padStart(4, "0")} ms`);
  const playheadX = useTransform(time, (t) => `${(t / TIMELINE - 1) * 100}%`);
  const playheadOpacity = useTransform(time, (t) => (!reduce && t > 0 && t < TIMELINE ? 1 : 0));
  return (
    <DemoFrame
      title="Durations"
      detail={
        <>
          t = <motion.span className="text-fg-1">{elapsed}</motion.span>
        </>
      }
      actions={<ActionButton label="Play" icon={Play} what="durations" onClick={play} />}
    >
      <div
        ref={ref}
        className="grid grid-cols-[6rem_minmax(0,1fr)_3.75rem] items-center gap-x-3 gap-y-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_4.5rem] sm:gap-x-5"
      >
        {DURATIONS.map((item, i) => (
          <DurationRow key={item.name} name={item.name} use={item.use} row={i + 1} time={time} reduce={reduce} />
        ))}
        <div aria-hidden className="pointer-events-none relative col-start-2 self-stretch overflow-hidden" style={{ gridRow: `1 / ${DURATIONS.length + 1}` }}>
          <motion.div className="absolute inset-y-0 left-0 w-full border-r border-monad-hi" style={{ x: playheadX, opacity: playheadOpacity }} />
        </div>
        <TimeAxis className="col-start-2 mt-1" style={{ gridRow: DURATIONS.length + 1 }} total={TIMELINE} step={100} labelEvery={200} />
        <p className="col-start-3 text-right font-mono text-caption text-fg-3" style={{ gridRow: DURATIONS.length + 1 }}>
          ms
        </p>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Easing
 * ---------------------------------------------------------------------------------------------- */

const EASINGS = [
  { name: "outExpo", css: "ease-out-expo", use: "Entrances: fast start, long settle." },
  { name: "outQuart", css: "ease-out-quart", use: "Small UI responses: hover, press release, value changes." },
  { name: "inOutQuart", css: "ease-in-out-quart", use: "Scene transitions: symmetric and weighty." },
  { name: "inQuart", css: "ease-in-quart", use: "Exits and falling things: a domino tipping over." },
  { name: "linear", css: "ease-linear", use: "Time itself: playheads, timers, scrubbed progress." },
] as const satisfies readonly { name: keyof typeof easing; css: string; use: string }[];

const EASE_CLOCK = duration.scene;
/** Plot box inside a 120 × 120 viewBox: room for tick marks on the left and bottom. */
const PLOT = { left: 12, top: 5, size: 103 };
const px = (p: number) => PLOT.left + PLOT.size * p;
const py = (v: number) => PLOT.top + PLOT.size * (1 - v);
const STROBE = Array.from({ length: 11 }, (_, i) => i / 10);

/** SVG path of an easing, sampled from `ease.*` (the same function canvas and WebGL use). */
function curvePath(fn: (t: number) => number, samples = 96) {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    return `${i ? "L" : "M"}${px(t).toFixed(2)} ${py(fn(t)).toFixed(2)}`;
  }).join(" ");
}

const CURVES = Object.fromEntries(EASINGS.map(({ name }) => [name, curvePath(ease[name])])) as Record<keyof typeof easing, string>;

function EasingCard({ name, css, use, time, reduce }: { name: keyof typeof easing; css: string; use: string; time: MotionValue<number>; reduce: boolean }) {
  const fn = ease[name];
  const [x1, y1, x2, y2] = easing[name];
  const dot = useRef<SVGGElement>(null);
  const crossX = useRef<SVGGElement>(null);
  const crossY = useRef<SVGGElement>(null);
  const runner = useRef<HTMLDivElement>(null);
  const ticks = useRef<HTMLDivElement>(null);

  // Imperative per-frame updates (no React render per frame): the dot rides the curve, the runner
  // moves with eased progress, strobe ticks light up at equal time steps. Reduced motion keeps only
  // the ticks (fades, no travel).
  useMotionValueEvent(time, "change", (t) => {
    const p = clamp(t / EASE_CLOCK);
    const v = fn(p);
    const running = p > 0 && p < 1;
    const travel = running && !reduce ? "1" : "0";
    dot.current?.setAttribute("transform", `translate(${px(p)} ${py(v)})`);
    crossX.current?.setAttribute("transform", `translate(${px(p)} 0)`);
    crossY.current?.setAttribute("transform", `translate(0 ${py(v)})`);
    for (const node of [dot.current, crossX.current, crossY.current]) if (node) node.style.opacity = travel;
    if (runner.current) {
      runner.current.style.transform = `translateX(${(v - 1) * 100}%)`;
      runner.current.style.opacity = travel;
    }
    ticks.current?.querySelectorAll<HTMLElement>("[data-tick]").forEach((tick, i) => {
      tick.dataset.lit = String(p >= STROBE[i]);
    });
  });

  return (
    <article className="flex min-w-0 flex-col rounded-[8px] border border-line-2 bg-bg">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h4 className="label-mono truncate text-fg-1">{kebab(name)}</h4>
      </header>
      <div className="px-3 pt-3">
        <svg viewBox="0 0 120 120" className="block w-full overflow-visible" aria-hidden>
          <g fill="none">
            {/* Grid and frame */}
            {[0.25, 0.5, 0.75].map((g) => (
              <g key={g} stroke="var(--color-line)">
                <line x1={px(g)} x2={px(g)} y1={py(0)} y2={py(1)} vectorEffect="non-scaling-stroke" />
                <line x1={px(0)} x2={px(1)} y1={py(g)} y2={py(g)} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            <rect x={PLOT.left} y={PLOT.top} width={PLOT.size} height={PLOT.size} stroke="var(--color-line-2)" vectorEffect="non-scaling-stroke" />
            {/* Axis ticks: time along the bottom, progress up the left side */}
            {STROBE.map((g, i) => (
              <g key={g} stroke={i % 5 === 0 ? "var(--color-fg-4)" : "var(--color-line-3)"}>
                <line x1={px(g)} x2={px(g)} y1={py(0)} y2={py(0) + (i % 5 === 0 ? 4 : 2)} vectorEffect="non-scaling-stroke" />
                <line x1={px(0)} x2={px(0) - (i % 5 === 0 ? 4 : 2)} y1={py(g)} y2={py(g)} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {/* Linear reference and the bezier handles */}
            <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="var(--color-line-2)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <g stroke="var(--color-fg-4)" strokeDasharray="1.5 2">
              <line x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} vectorEffect="non-scaling-stroke" />
              <line x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} vectorEffect="non-scaling-stroke" />
            </g>
            <circle cx={px(x1)} cy={py(y1)} r={1.8} fill="var(--color-bg)" stroke="var(--color-fg-3)" vectorEffect="non-scaling-stroke" />
            <circle cx={px(x2)} cy={py(y2)} r={1.8} fill="var(--color-bg)" stroke="var(--color-fg-3)" vectorEffect="non-scaling-stroke" />
            {/* The curve */}
            <path d={CURVES[name]} stroke="var(--color-fg-1)" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {/* Crosshair + dot, moved per frame */}
            <g ref={crossX} opacity={0} className="transition-opacity duration-(--dur-fast)">
              <line x1={0} x2={0} y1={py(1)} y2={py(0)} stroke="var(--color-line-3)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            </g>
            <g ref={crossY} opacity={0} className="transition-opacity duration-(--dur-fast)">
              <line x1={px(0)} x2={px(1)} y1={0} y2={0} stroke="var(--color-line-3)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            </g>
            <g ref={dot} opacity={0} className="transition-opacity duration-(--dur-fast)">
              <circle r={5} fill="var(--color-fg-1)" opacity={0.14} />
              <circle r={2.4} fill="var(--color-fg-1)" />
            </g>
          </g>
        </svg>
      </div>
      {/* Strobe: where the value is at 11 equal time steps. Dense = slow, sparse = fast. */}
      <div aria-hidden className="relative mx-3 mt-2 mb-3 h-5">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-2" />
        <div ref={ticks}>
          {STROBE.map((t) => (
            <span
              key={t}
              data-tick=""
              data-lit="true"
              className="absolute top-1 bottom-1 w-px -translate-x-1/2 bg-fg-2 transition-opacity duration-(--dur-fast) data-[lit=false]:opacity-20"
              style={{ left: `${fn(t) * 100}%` }}
            />
          ))}
        </div>
        <div className="absolute -inset-y-0.5 inset-x-0 overflow-hidden">
          <div ref={runner} className="absolute inset-0 opacity-0">
            <span className="absolute inset-y-0 right-0 w-0.5 rounded-full bg-monad-hi" />
          </div>
        </div>
      </div>
      <footer className="flex flex-col gap-1 border-t border-line px-3 py-2.5">
        <code className="text-caption break-all text-fg-2">{css}</code>
        <p className="font-mono text-[0.6875rem] leading-4 text-fg-3">{[x1, y1, x2, y2].join(", ")}</p>
        <p className="mt-1 text-caption text-fg-3">{use}</p>
      </footer>
    </article>
  );
}

export function EasingDemo() {
  const { time, play } = useClock(EASE_CLOCK);
  const ref = useRef<HTMLDivElement>(null);
  useAutoplay(ref, play);
  const reduce = useShouldReduceMotion();
  return (
    <DemoFrame
      title="Easing"
      detail={`one ${EASE_CLOCK} ms clock, five curves`}
      actions={<ActionButton label="Play" icon={Play} what="easing curves" onClick={play} />}
      bodyClassName="p-3 sm:p-4"
    >
      <div ref={ref} className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {EASINGS.map((item) => (
          <EasingCard key={item.name} name={item.name} css={item.css} use={item.use} time={time} reduce={reduce} />
        ))}
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Springs
 * ---------------------------------------------------------------------------------------------- */

const TRACE_MS = 1000;
const TRACE_TOP = 1.3;
const TRACE = { left: 2, right: 238, top: 6, bottom: 58 };
const tx = (seconds: number) => TRACE.left + (TRACE.right - TRACE.left) * clamp(seconds / toSeconds(TRACE_MS));
const ty = (v: number) => TRACE.bottom - (TRACE.bottom - TRACE.top) * (v / TRACE_TOP);

type SpringName = keyof typeof spring;

const SPRING_FACTS = Object.fromEntries(
  (Object.keys(spring) as SpringName[]).map((name) => {
    const token = spring[name];
    const samples = 240;
    const path = Array.from({ length: samples + 1 }, (_, i) => {
      const s = (i / samples) * toSeconds(TRACE_MS);
      return `${i ? "L" : "M"}${tx(s).toFixed(2)} ${ty(springStep(token, s)).toFixed(2)}`;
    }).join(" ");
    return [name, { path, zeta: dampingRatio(token), overshoot: springOvershoot(token), peak: springPeakTime(token), settle: springSettleTime(token) }];
  }),
) as Record<SpringName, { path: string; zeta: number; overshoot: number; peak: number; settle: number }>;

const fixed = (value: number, digits = 2) => value.toFixed(digits);

/** The spring's step response as a seismograph trace, with a cursor that follows the demo's clock. */
function SpringTrace({ name, time, reduce }: { name: SpringName; time: MotionValue<number>; reduce: boolean }) {
  const token = spring[name];
  const facts = SPRING_FACTS[name];
  const cursor = useRef<SVGGElement>(null);
  const dot = useRef<SVGGElement>(null);
  useMotionValueEvent(time, "change", (t) => {
    const s = toSeconds(t);
    const visible = !reduce && t > 0 && t < TRACE_MS ? "1" : "0";
    cursor.current?.setAttribute("transform", `translate(${tx(s)} 0)`);
    dot.current?.setAttribute("transform", `translate(${tx(s)} ${ty(springStep(token, s))})`);
    for (const node of [cursor.current, dot.current]) if (node) node.style.opacity = visible;
  });
  const band = 0.02;
  return (
    <svg viewBox="0 0 240 66" className="block w-full overflow-visible" aria-hidden>
      <rect x={TRACE.left} width={TRACE.right - TRACE.left} y={ty(1 + band)} height={ty(1 - band) - ty(1 + band)} fill="var(--color-line)" />
      <line x1={TRACE.left} x2={TRACE.right} y1={ty(1)} y2={ty(1)} stroke="var(--color-line-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <line x1={TRACE.left} x2={TRACE.right} y1={ty(0)} y2={ty(0)} stroke="var(--color-line-2)" vectorEffect="non-scaling-stroke" />
      {Array.from({ length: 11 }, (_, i) => (
        <line
          key={i}
          x1={tx(i / 10)}
          x2={tx(i / 10)}
          y1={ty(0)}
          y2={ty(0) + (i % 5 === 0 ? 5 : 2.5)}
          stroke={i % 5 === 0 ? "var(--color-fg-4)" : "var(--color-line-3)"}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {facts.settle < 1 && (
        <line x1={tx(facts.settle)} x2={tx(facts.settle)} y1={ty(1) - 7} y2={ty(1) + 7} stroke="var(--color-fg-2)" vectorEffect="non-scaling-stroke" />
      )}
      <path d={facts.path} fill="none" stroke="var(--color-fg-1)" strokeWidth={1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <g ref={cursor} opacity={0}>
        <line x1={0} x2={0} y1={TRACE.top - 2} y2={ty(0)} stroke="var(--color-monad-hi)" vectorEffect="non-scaling-stroke" />
      </g>
      <g ref={dot} opacity={0}>
        <circle r={2.6} fill="var(--color-monad-hi)" />
      </g>
    </svg>
  );
}

function SpringCard({
  name,
  use,
  action,
  time,
  reduce,
  children,
}: {
  name: SpringName;
  use: string;
  action: ReactNode;
  time: MotionValue<number>;
  reduce: boolean;
  children: ReactNode;
}) {
  const token = spring[name];
  const facts = SPRING_FACTS[name];
  const cells: [string, ReactNode, string][] = [
    ["stiffness", "Stiffness", String(token.stiffness)],
    ["damping", "Damping", String(token.damping)],
    ["mass", "Mass", String(token.mass)],
    // label-mono uppercases, and an uppercase ζ (Ζ) reads as a Latin Z.
    ["zeta", <>Ratio <span className="normal-case">ζ</span></>, fixed(facts.zeta)],
    ["overshoot", "Overshoot", facts.overshoot < 0.001 ? "none" : `${Math.round(facts.overshoot * 100)} %`],
    ["settle", "Settle", `${fixed(facts.settle)} s`],
  ];
  return (
    <article className="flex min-w-0 flex-col rounded-panel border border-line-2 bg-elev-1 shadow-panel">
      <header className="flex min-h-13 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h4 className="font-mono text-body-sm text-fg-1">
          <span className="text-fg-3">spring.</span>
          {name}
        </h4>
        {action}
      </header>
      <div className="relative h-44 overflow-hidden border-b border-line bg-bg bg-grid [--grid-cell:22px]">{children}</div>
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
        {cells.map(([key, term, value]) => (
          <div key={key} className="flex min-w-0 flex-col gap-1 bg-elev-1 px-3.5 py-2.5">
            <dt className="label-mono truncate text-fg-3">{term}</dt>
            <dd className="font-mono text-body-sm text-fg-1">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 pt-4">
        <SpringTrace name={name} time={time} reduce={reduce} />
        <p className="mt-2 flex justify-between font-mono text-[0.6875rem] leading-none text-fg-3" aria-hidden>
          <span>0</span>
          <span>step response · settle band ±2 %</span>
          <span>1 s</span>
        </p>
      </div>
      <p className="mt-auto px-4 pt-4 pb-4 text-caption text-fg-3">{use}</p>
    </article>
  );
}

function SoftDemo() {
  const reduce = useShouldReduceMotion();
  const { time, play } = useClock(TRACE_MS);
  const [open, setOpen] = useState(true);
  const progress = useSpring(1, spring.soft);
  const x = useTransform(progress, (v) => `${(1 - v) * 112}%`);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    // A click mid-flight retargets the running spring (it keeps its velocity) instead of restarting.
    if (reduce) progress.jump(next ? 1 : 0);
    else progress.set(next ? 1 : 0);
    play();
  };
  return (
    <SpringCard
      name="soft"
      use="Default settle: panels, toggles, retargeted values. Close to critical damping, no visible overshoot."
      time={time}
      reduce={reduce}
      action={<ActionButton label="Panel" what="visible" icon={PanelRight} pressed={open} onClick={toggle} />}
    >
      <motion.div className="absolute inset-y-5 right-5 w-[64%] rounded-[6px] border border-line-3 bg-elev-2 shadow-pop" style={{ x }}>
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="label-mono text-fg-2">Position</span>
          <span className="size-1.5 rounded-full bg-calm" />
        </div>
        <div className="flex flex-col gap-2.5 px-3 py-3">
          {[
            ["Health", "w-12"],
            ["Debt", "w-16"],
            ["Collateral", "w-9"],
          ].map(([term, width]) => (
            <div key={term} className="flex items-center justify-between gap-2">
              <span className="label-mono text-fg-3">{term}</span>
              <span className={cn("h-1.5 rounded-full bg-fg-3/35", width)} />
            </div>
          ))}
        </div>
      </motion.div>
    </SpringCard>
  );
}

const DROP = 76;

function ImpactDemo() {
  const reduce = useShouldReduceMotion();
  const { time, play } = useClock(TRACE_MS);
  const y = useSpring(0, spring.impact);
  const opacity = useMotionValue(1);
  // The floor plate gives way with the overshoot, so the dip reads as impact, not as a glitch.
  const plate = useTransform(y, (v) => Math.max(v, 0));
  const drop = () => {
    if (reduce) {
      animate(opacity, [0.15, 1], transition.base);
    } else {
      y.jump(-DROP);
      y.set(0);
    }
    play();
  };
  return (
    <SpringCard
      name="impact"
      use="The shock moment: fast, with a hard overshoot. A liquidation lands, a price level drops."
      time={time}
      reduce={reduce}
      action={<ActionButton label="Drop" what="the block" icon={ArrowDown} onClick={drop} />}
    >
      <div
        aria-hidden
        className="absolute left-1/2 -ml-6 size-12 rounded-[5px] border border-dashed border-line-3"
        style={{ bottom: `calc(2.5rem + ${DROP}px)` }}
      />
      <div className="absolute bottom-10 left-5 right-[calc(50%+2.5rem)] h-px bg-line-3" />
      <div className="absolute right-5 bottom-10 left-[calc(50%+2.5rem)] h-px bg-line-3" />
      <motion.div className="absolute bottom-10 left-1/2 -ml-10 h-px w-20 bg-fg-2" style={{ y: plate }} />
      <div
        className="absolute inset-x-5 bottom-7 h-2"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--color-line-2) 0 1px, transparent 1px 12px)" }}
      />
      <motion.div
        className="absolute bottom-10 left-1/2 -ml-6 flex size-12 items-center justify-center rounded-[5px] border border-liq/70 bg-liq/20 shadow-glow-liq"
        style={{ y, opacity }}
      >
        <span className="label-mono text-liq-hi">liq</span>
      </motion.div>
    </SpringCard>
  );
}

/** Gauge geometry (viewBox 0 0 200 124): angles in degrees from 12 o'clock, clockwise. */
const GAUGE = { cx: 100, cy: 112, r: 84 };
// Rounded: Node and the browser disagree in the last bits of sin/cos, which breaks hydration.
const round2 = (v: number) => Math.round(v * 100) / 100;
const polar = (angle: number, r: number) => {
  const a = (angle * Math.PI) / 180;
  return [round2(GAUGE.cx + r * Math.sin(a)), round2(GAUGE.cy - r * Math.cos(a))] as const;
};
const arc = (from: number, to: number, r: number) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const NEEDLE_REST = -40;
const ZONES = [
  { from: -90, to: 30, stroke: "var(--color-calm)" },
  { from: 30, to: 64, stroke: "var(--color-warn)" },
  { from: 64, to: 90, stroke: "var(--color-liq)" },
];

function NeedleDemo() {
  const reduce = useShouldReduceMotion();
  const random = useRandom();
  const { time, play } = useClock(TRACE_MS);
  const angle = useSpring(NEEDLE_REST, spring.needle);
  const target = useRef(NEEDLE_REST);
  const needle = useRef<SVGGElement>(null);
  const marker = useRef<SVGGElement>(null);
  useMotionValueEvent(angle, "change", (a) => needle.current?.setAttribute("transform", `rotate(${a.toFixed(3)} ${GAUGE.cx} ${GAUGE.cy})`));

  const shock = () => {
    // Seeded under ?demo=1, so recordings kick the needle to the same places every time.
    let next = target.current;
    for (let i = 0; i < 12 && Math.abs(next - target.current) < 45; i++) next = randomBetween(random, -74, 80);
    target.current = next;
    marker.current?.setAttribute("transform", `rotate(${next.toFixed(3)} ${GAUGE.cx} ${GAUGE.cy})`);
    // Mid-flight shocks retarget the spring with its current velocity: interruptible by design.
    if (reduce) angle.jump(next);
    else angle.set(next);
    play();
  };

  const [pivotX, pivotY] = [GAUGE.cx, GAUGE.cy];
  return (
    <SpringCard
      name="needle"
      use="Gauges: trembles like a seismograph needle, then settles. Shock it again mid-swing: it retargets."
      time={time}
      reduce={reduce}
      action={<ActionButton label="Shock" what="the gauge" icon={Zap} onClick={shock} />}
    >
      <svg viewBox="0 0 200 124" className="absolute inset-x-0 bottom-2 mx-auto h-[calc(100%-1rem)] w-auto max-w-full" aria-hidden>
        {ZONES.map((zone) => (
          <path key={zone.from} d={arc(zone.from, zone.to, GAUGE.r + 7)} fill="none" stroke={zone.stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={arc(-90, 90, GAUGE.r)} fill="none" stroke="var(--color-line-2)" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: 31 }, (_, i) => {
          const a = -90 + i * 6;
          const major = i % 5 === 0;
          const [x1, y1] = polar(a, GAUGE.r);
          const [x2, y2] = polar(a, GAUGE.r - (major ? 9 : 5));
          return (
            <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? "var(--color-fg-3)" : "var(--color-line-3)"} vectorEffect="non-scaling-stroke" />
          );
        })}
        <g ref={marker} transform={`rotate(${NEEDLE_REST} ${pivotX} ${pivotY})`}>
          <path d={`M${pivotX} ${pivotY - GAUGE.r - 11} l-3.5 -6 h7 z`} fill="var(--color-monad-hi)" />
        </g>
        <g ref={needle} transform={`rotate(${NEEDLE_REST} ${pivotX} ${pivotY})`}>
          <line x1={pivotX} y1={pivotY + 10} x2={pivotX} y2={pivotY - GAUGE.r + 12} stroke="var(--color-fg-1)" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
        <circle cx={pivotX} cy={pivotY} r={4.5} fill="var(--color-elev-3)" stroke="var(--color-fg-2)" vectorEffect="non-scaling-stroke" />
      </svg>
    </SpringCard>
  );
}

export function SpringDemos() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SoftDemo />
      <ImpactDemo />
      <NeedleDemo />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Stagger
 * ---------------------------------------------------------------------------------------------- */

const TILES = 40;
const GAPS: StaggerGap[] = ["tight", "base", "loose"];
const tileTone = (i: number) =>
  i === 0 ? "border-liq bg-liq/45" : i < 4 ? "border-liq/55 bg-liq/15" : i < 17 ? "border-warn/50 bg-warn/15" : "border-line-2 bg-elev-2";

export function StaggerDemo() {
  const [run, setRun] = useState(0);
  return (
    <DemoFrame
      title="Stagger"
      detail="40 tiles per grid, one wave each"
      actions={<ActionButton what="stagger" onClick={() => setRun((value) => value + 1)} />}
    >
      <div className="grid gap-7 lg:grid-cols-3 lg:gap-6">
        {GAPS.map((gap) => (
          <div key={gap} className="min-w-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="label-mono text-fg-1">
                {gap} <span className="text-fg-3">· {stagger[gap]} ms</span>
              </p>
              <p className="font-mono text-caption text-fg-3">last tile +{(TILES - 1) * stagger[gap]} ms</p>
            </div>
            <Stagger
              key={`${gap}-${run}`}
              as="ul"
              gap={gap}
              trigger={run === 0 ? "view" : "mount"}
              aria-hidden
              className="grid grid-cols-10 gap-[3px]"
            >
              {Array.from({ length: TILES }, (_, i) => (
                <StaggerItem as="li" key={i} className={cn("aspect-square rounded-[3px] border", tileTone(i))} />
              ))}
            </Stagger>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-2xl text-caption text-fg-3">
        Tiles are illustrative, not data: the red tile starts the wave and the rest follow in reading order. Dense grids use{" "}
        <code className="text-fg-2">tight</code>, lists <code className="text-fg-2">base</code>, a few large panels{" "}
        <code className="text-fg-2">loose</code>.
      </p>
    </DemoFrame>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Choreography: context → hero → detail
 * ---------------------------------------------------------------------------------------------- */

export type ChoreographyData = {
  context: string;
  block: string;
  heroLabel: string;
  hero: string;
  details: readonly (readonly [string, string])[];
};

const CHOREO_MS = 1000;

function beatVariants(delay: number, forced: boolean): Variants {
  return {
    hidden: { opacity: 0, y: forced ? 0 : "var(--rise)" },
    visible: { opacity: 1, y: 0, transition: { ...transition.slow, delay: toSeconds(delay) } },
  };
}

export function ChoreographyDemo({ data }: { data: ChoreographyData }) {
  const [run, setRun] = useState(0);
  const { time, play } = useClock(CHOREO_MS);
  const forced = useForcedReducedMotion();
  const reduce = useShouldReduceMotion();
  const replay = () => {
    setRun((value) => value + 1);
    play();
  };
  const detailEnd = beat.detail + (data.details.length - 1) * stagger.base + duration.slow;
  const beats = [
    { label: "Context", at: beat.context, end: beat.context + duration.slow, tone: "border-calm/70 bg-calm/20" },
    { label: "Hero", at: beat.hero, end: beat.hero + duration.slow, tone: "border-fg-1 bg-fg-1/25" },
    { label: "Detail", at: beat.detail, end: detailEnd, tone: "border-fg-3/70 bg-fg-3/15" },
  ];
  const playX = useTransform(time, (t) => `${(t / CHOREO_MS - 1) * 100}%`);
  const playOpacity = useTransform(time, (t) => (!reduce && t > 0 && t < CHOREO_MS ? 1 : 0));
  const trigger = run === 0 ? { whileInView: "visible", viewport: { once: true, margin: "0px 0px -15% 0px" } } : { animate: "visible" };

  return (
    <DemoFrame title="Choreography" detail="beat.context → beat.hero → beat.detail" actions={<ActionButton what="choreography" onClick={replay} />}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
        <motion.article
          key={run}
          initial="hidden"
          {...trigger}
          onViewportEnter={run === 0 ? play : undefined}
          className="rounded-panel border border-line-3 bg-bg shadow-pop"
        >
          <motion.header
            data-reveal=""
            variants={beatVariants(beat.context, forced)}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5"
          >
            <span className="label-mono text-fg-2">{data.context}</span>
            <span className="font-mono text-caption text-fg-3">{data.block}</span>
          </motion.header>
          <motion.div data-reveal="" variants={beatVariants(beat.hero, forced)} className="px-5 pt-5 pb-4">
            <p className="label-mono text-fg-3">{data.heroLabel}</p>
            <p className="mt-2 font-mono text-metric-lg text-fg-1">{data.hero}</p>
          </motion.div>
          <dl className="border-t border-line">
            {data.details.map(([term, value], i) => (
              <motion.div
                key={term}
                data-reveal=""
                variants={beatVariants(beat.detail + i * stagger.base, forced)}
                className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3 last:border-b-0"
              >
                <dt className="label-mono text-fg-3">{term}</dt>
                <dd className="font-mono text-body-sm text-fg-1">{value}</dd>
              </motion.div>
            ))}
          </dl>
        </motion.article>

        <div className="min-w-0">
          <p className="label-mono mb-4 text-fg-3">Timeline · ms from the start of the sequence</p>
          <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-4 gap-y-3">
            {beats.map((item, i) => (
              <div key={item.label} className="contents">
                <div style={{ gridRow: i + 1 }} className="col-start-1">
                  <p className="label-mono text-fg-1">{item.label}</p>
                  <p className="font-mono text-caption text-fg-3">+{item.at} ms</p>
                </div>
                <div style={{ gridRow: i + 1 }} className="relative col-start-2 h-9 self-center">
                  <span className="absolute inset-y-0 w-px bg-line-3" style={{ left: `${(item.at / CHOREO_MS) * 100}%` }} />
                  <span
                    className={cn("absolute inset-y-1.5 rounded-[3px] border", item.tone)}
                    style={{ left: `${(item.at / CHOREO_MS) * 100}%`, width: `${((item.end - item.at) / CHOREO_MS) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <div aria-hidden className="pointer-events-none relative col-start-2 overflow-hidden" style={{ gridRow: `1 / ${beats.length + 1}` }}>
              <motion.div className="absolute inset-y-0 left-0 w-full border-r border-monad-hi" style={{ x: playX, opacity: playOpacity }} />
            </div>
            <TimeAxis className="col-start-2" style={{ gridRow: beats.length + 1 }} total={CHOREO_MS} step={50} labelEvery={200} />
          </div>
          <p className="mt-5 max-w-md text-caption text-fg-3">
            Each part rises for {duration.slow} ms (<code className="text-fg-2">transition.slow</code>); detail rows follow {stagger.base} ms apart.
            The number is the only hero, so nothing competes with it.
          </p>
        </div>
      </div>
    </DemoFrame>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Primitives
 * ---------------------------------------------------------------------------------------------- */

function useReplay() {
  const [run, setRun] = useState(0);
  return [run, () => setRun((value) => value + 1)] as const;
}

export function RevealDemo() {
  const [run, replay] = useReplay();
  return (
    <div className="flex w-full flex-col items-start gap-4">
      <Reveal key={run} className="w-full rounded-[8px] border border-line-2 bg-bg p-4">
        <p className="label-mono text-fg-3">Below the fold</p>
        <p className="mt-2 text-body-sm text-fg-2">Rises {distance.rise} px and fades in once, when it scrolls into view.</p>
      </Reveal>
      <ActionButton what="reveal" onClick={replay} />
    </div>
  );
}

export function RiseDemo() {
  const [run, replay] = useReplay();
  return (
    <div className="flex w-full flex-col items-start gap-4">
      <div key={run} className="w-full rounded-[8px] border border-line-2 bg-bg p-4">
        <p className="label-mono animate-rise text-fg-3 [animation-delay:var(--beat-context)]">Above the fold</p>
        <p className="mt-2 animate-rise font-mono text-metric-sm text-fg-1 [animation-delay:var(--beat-hero)]">0123456789</p>
        <p className="mt-1 animate-rise text-body-sm text-fg-2 [animation-delay:var(--beat-detail)]">Plays at first paint, beats from CSS variables.</p>
      </div>
      <ActionButton what="rise" onClick={replay} />
    </div>
  );
}

export function SplitTextDemo() {
  const [run, replay] = useReplay();
  return (
    <div className="flex w-full flex-col items-start gap-6">
      <SplitText key={run} as="p" lines={["One transaction.", "Every liquidation wave."]} accent={[2]} className="text-display text-fg-1" />
      <ActionButton what="headline" onClick={replay} />
    </div>
  );
}

function PointerStatus() {
  const hydrated = useHydrated();
  const fine = useFinePointer();
  const reduce = useShouldReduceMotion();
  if (!hydrated) return <Skeleton className="w-40" />;
  const [on, why] = !fine ? [false, "touch pointer"] : reduce ? [false, "reduced motion"] : [true, "fine pointer"];
  return (
    <p className="flex items-center gap-2 label-mono text-fg-3">
      <span aria-hidden className={cn("size-1.5 rounded-full", on ? "bg-safe" : "bg-fg-4")} />
      {on ? "Active" : "Off"} · {why}
    </p>
  );
}

export function MagneticDemo() {
  return (
    <div className="flex w-full flex-col gap-5 self-stretch">
      <div className="flex flex-1 flex-wrap items-center justify-center gap-3 rounded-[8px] border border-dashed border-line-2 px-4 py-10">
        <Magnetic>
          <Button variant="primary" size="lg">
            Run the stress test <ButtonArrow />
          </Button>
        </Magnetic>
        <Magnetic strength={4}>
          <Button variant="secondary" size="lg">
            Is my position safe?
          </Button>
        </Magnetic>
      </div>
      <PointerStatus />
    </div>
  );
}

export function SpotlightDemo({ rows, caption }: { rows: readonly (readonly [string, string])[]; caption: string }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <Spotlight className="w-full rounded-[8px] border border-line-2 bg-bg">
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <span className="label-mono text-fg-2">Debt by asset</span>
          <span className="label-mono text-fg-3">{caption}</span>
        </div>
        <dl>
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-2.5 last:border-b-0">
              <dt className="truncate font-mono text-body-sm text-fg-2">{term}</dt>
              <dd className="font-mono text-body-sm text-fg-1">{value}</dd>
            </div>
          ))}
        </dl>
      </Spotlight>
      <PointerStatus />
    </div>
  );
}
