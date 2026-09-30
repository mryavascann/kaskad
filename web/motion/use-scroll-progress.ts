"use client";

/**
 * Scroll progress of an element as a MotionValue (0 → 1), driven by a GSAP ScrollTrigger that is
 * loaded after hydration (`loadScrollKit`). Consumers read it without React re-renders (three.js
 * progress, CSS variables) or subscribe to it.
 *
 * Reduced motion: no trigger is created and the value jumps to `reducedValue` (default 1: the final
 * state, every outcome visible), so a static layout shows the complete result.
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
import { loadScrollKit } from "./scroll";

export type ScrollProgressOptions = {
  /** ScrollTrigger start, e.g. "top top". */
  start?: string;
  /** ScrollTrigger end, e.g. "bottom bottom" or "+=160%". */
  end?: string;
  /** Value while nothing has loaded yet (server, first paint). Default 0. */
  initial?: number;
  /** Value under reduced motion. Default 1 (the final state). */
  reducedValue?: number;
  /** Set false to leave the value alone (e.g. a scene that is not mounted yet). */
  enabled?: boolean;
};

export function useScrollProgress(target: RefObject<HTMLElement | null>, opts: ScrollProgressOptions = {}): MotionValue<number> {
  const { start = "top top", end = "bottom bottom", initial = 0, reducedValue = 1, enabled = true } = opts;
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
    let kill: (() => void) | null = null;
    loadScrollKit()
      .then(({ ScrollTrigger }) => {
        if (cancelled) return;
        const trigger = ScrollTrigger.create({
          trigger: node,
          start,
          end,
          onUpdate: (self) => progress.set(self.progress),
          onRefresh: (self) => progress.set(self.progress),
        });
        progress.set(trigger.progress);
        kill = () => trigger.kill();
      })
      .catch(() => {
        // The chunk failed to load: show the final state rather than a frozen first frame.
        if (!cancelled) progress.jump(reducedValue);
      });
    return () => {
      cancelled = true;
      kill?.();
    };
  }, [target, start, end, reduce, reducedValue, enabled, progress]);

  return progress;
}
