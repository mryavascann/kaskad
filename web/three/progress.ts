/**
 * The scene's progress input: a number (React state) or a MotionValue-like source for scroll-driven
 * updates without React renders (GSAP ScrollTrigger → `value.set(self.progress)`). Type-only
 * dependency on Motion.
 */
import type { MotionValue } from "motion/react";

export type ProgressSource = number | MotionValue<number>;

type Subscribable = { get(): number; on(event: "change", callback: (value: number) => void): () => void };

export function isProgressValue(source: unknown): source is Subscribable {
  return typeof source === "object" && source !== null && typeof (source as Subscribable).get === "function" && typeof (source as Subscribable).on === "function";
}

/** Current value of a progress source, clamped to [0, 1] (NaN → 0). */
export function readProgress(source: ProgressSource | undefined): number {
  const value = isProgressValue(source) ? source.get() : (source ?? 0);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Calls `onChange` with every new value of a MotionValue-like source; numbers never change. */
export function subscribeProgress(source: ProgressSource, onChange: (value: number) => void): () => void {
  if (!isProgressValue(source)) return () => {};
  return source.on("change", onChange);
}
