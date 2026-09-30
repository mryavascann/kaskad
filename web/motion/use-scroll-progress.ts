"use client";

/**
 * Scroll progress of an element as a MotionValue (0 → 1), from native scroll events
 * (`observeScrollProgress`: cached offsets, one update per frame, no library). Consumers read it
 * without React re-renders (three.js progress, CSS variables) or subscribe to it.
 *
 * `when` (optional) delays the observer until a promise resolves, e.g. `whenScrollIntent` so a
 * scene does nothing while the page loads. Reduced motion: no observer and the value jumps to
 * `reducedValue` (default 1: the final state, every outcome visible), so a static layout shows the
 * complete result.
 *
 * ```tsx
 * const track = useRef<HTMLDivElement>(null);
 * const progress = useScrollProgress(track, { start: "top top", end: "bottom bottom" });
 * <HeroStage progress={progress} />
 * ```
 */
import { useMotionValue, type MotionValue } from "motion/react";
import { useEffect, type RefObject } from "react";
import { useShouldReduceMotion } from "./hooks";
import { observeScrollProgress } from "./scroll";

export type ScrollProgressOptions = {
  /** Start, "<element edge> <viewport edge>" (see `ScrollRange`), e.g. "top top". */
  start?: string;
  /** End, same syntax, e.g. "bottom bottom". */
  end?: string;
  /** Value until the observer runs (server, first paint). Default 0. */
  initial?: number;
  /** Value under reduced motion. Default 1 (the final state). */
  reducedValue?: number;
  /** Set false to leave the value alone (e.g. a scene that is not mounted yet). */
  enabled?: boolean;
  /** Start observing once this resolves (default: right after hydration). */
  when?: () => Promise<void>;
};

export function useScrollProgress(target: RefObject<HTMLElement | null>, opts: ScrollProgressOptions = {}): MotionValue<number> {
  const { start = "top top", end = "bottom bottom", initial = 0, reducedValue = 1, enabled = true, when } = opts;
  const progress = useMotionValue(initial);
  const reduce = useShouldReduceMotion();

  useEffect(() => {
    if (!enabled) return;
    if (reduce) {
      progress.jump(reducedValue);
      return;
    }
    const node = target.current;
    if (!node) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    const run = () => {
      if (!cancelled) stop = observeScrollProgress(node, { start, end }, (p) => progress.set(p));
    };
    if (when) void when().then(run);
    else run();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [target, start, end, reduce, reducedValue, enabled, progress, when]);

  return progress;
}
