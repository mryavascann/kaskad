"use client";

/**
 * The hero stage: the SVG poster first (server render, hydration, no layout shift), then — on
 * capable devices, once the stage is near the viewport and the browser is idle — the WebGL scene,
 * cross-faded in when its first frame is on screen. Reduced motion, no or software WebGL, low-end
 * devices and the data saver keep the poster, showing the final state (every outcome visible).
 * The stage is decorative (`aria-hidden`): the page carries the text.
 */
import dynamic from "next/dynamic";
import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDemoMode } from "@/motion/demo-mode";
import { usePrefersReducedMotion } from "@/motion/hooks";
import { chooseHeroMode, readHeroEnv, type HeroModeDecision, type HeroModePreference } from "./capability";
import { HeroPoster } from "./hero-poster";
import type { HeroQuality, HeroStats } from "./hero-scene";
import type { HeroPosition } from "./model";
import { readProgress, type ProgressSource } from "./progress";

const HeroScene = dynamic(() => import("./hero-scene").then((m) => m.HeroScene), { ssr: false });

export type HeroStageProps = {
  /** Classified positions (`heroFromClassification`); absent: the neutral loading row. */
  positions?: readonly HeroPosition[] | null;
  /** Timeline progress 0–1: a number, or a MotionValue (scroll-driven, no re-renders). */
  progress?: ProgressSource;
  /** Dominoes in the neutral row (pass the book's real position count). */
  placeholderCount?: number;
  /** `auto` decides from the device; `scene` / `poster` force one (e.g. /design). */
  mode?: HeroModePreference;
  /** Default `auto` (adapts to the frame budget); demo mode (`?demo=1`) pins `high` for recordings. */
  quality?: HeroQuality;
  parallax?: boolean;
  /** Progress the poster shows when it is the final output (reduced motion, low-end). Default 1. */
  posterProgress?: number;
  onModeChange?: (decision: HeroModeDecision) => void;
  onReady?: () => void;
  onStats?: (stats: HeroStats) => void;
  /** Sizes the stage; it fills whatever box it is given and never sizes itself from content. */
  className?: string;
};

const SCENE_FAILED: HeroModeDecision = { mode: "poster", reason: "scene-failed" };

/** Runs `callback` after the next paint, when the browser is idle (at most ~1.2 s later). */
function afterIdle(callback: () => void): () => void {
  let idle = 0;
  let timeout = 0;
  const frame = requestAnimationFrame(() => {
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(callback, { timeout: 1200 });
    else timeout = window.setTimeout(callback, 120);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (idle) window.cancelIdleCallback(idle);
    if (timeout) window.clearTimeout(timeout);
  };
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function HeroStage({
  positions,
  progress = 0,
  placeholderCount,
  mode = "auto",
  quality,
  parallax,
  posterProgress = 1,
  onModeChange,
  onReady,
  onStats,
  className,
}: HeroStageProps) {
  const container = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const demo = useDemoMode();
  const [decision, setDecision] = useState<HeroModeDecision | null>(null);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(false);
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [placeholderGone, setPlaceholderGone] = useState(false);
  // The placeholder shows the frame the canvas will open on.
  const [initialProgress] = useState(() => readProgress(progress));
  const callbacks = useRef({ onModeChange, onReady });
  useLayoutEffect(() => {
    callbacks.current = { onModeChange, onReady };
  });

  // Decide after the first paint: the server and hydration always render the poster, and the WebGL
  // probe (throwaway contexts) should not delay it. Re-decides when reduced motion is switched.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const next = failed ? SCENE_FAILED : chooseHeroMode(readHeroEnv(), mode);
      setDecision(next);
      callbacks.current.onModeChange?.(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, reducedMotion, failed]);

  // Only load WebGL for a stage that is (about to be) on screen.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: "50% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const wantsScene = decision?.mode === "scene" && near;
  useEffect(() => {
    if (!wantsScene) return;
    return afterIdle(() => setLoad(true));
  }, [wantsScene]);

  const showScene = wantsScene && load && !failed;
  const sceneVisible = showScene && ready;
  // Poster as the final output: the final frame fades in over the placeholder (a short fade stays
  // under reduced motion), unless the placeholder already shows that frame.
  const showFinal = decision?.mode === "poster" && (posterProgress !== initialProgress || placeholderGone);
  const fail = () => {
    setFailed(true);
    setReady(false);
  };

  return (
    <div
      ref={container}
      aria-hidden
      data-hero-stage=""
      data-mode={decision?.mode ?? "pending"}
      data-reason={decision?.reason}
      data-ready={sceneVisible ? "" : undefined}
      className={cn("relative isolate overflow-hidden bg-void", className)}
    >
      {!placeholderGone && <HeroPoster positions={positions} progress={initialProgress} placeholderCount={placeholderCount} />}
      {showFinal && (
        <div className="absolute inset-0 animate-fade-in" onAnimationEnd={() => setPlaceholderGone(true)}>
          <HeroPoster positions={positions} progress={posterProgress} placeholderCount={placeholderCount} />
        </div>
      )}
      {showScene && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-(--dur-slow) ease-out-quart",
            sceneVisible ? "opacity-100" : "opacity-0",
          )}
          onTransitionEnd={() => setPlaceholderGone(sceneVisible)}
        >
          <SceneBoundary onError={fail}>
            <HeroScene
              positions={positions}
              progress={progress}
              placeholderCount={placeholderCount}
              quality={quality ?? (demo ? "high" : "auto")}
              parallax={parallax}
              onStats={onStats}
              onContextLost={fail}
              onReady={() => {
                setReady(true);
                callbacks.current.onReady?.();
              }}
            />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
