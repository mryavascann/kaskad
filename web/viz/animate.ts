"use client";

// Motion's imperative `animate` (the full animation engine plus DOM visual elements) loaded with
// import() instead of with the page: the charts render first, their entrances start once it is
// there. `loadAnimate()` on mount makes every later start synchronous, so data-driven updates
// (retargets, FLIP) behave exactly as with a static import.

import type { animate as motionAnimate } from "motion/react";

export type Animate = typeof motionAnimate;
type Controls = { stop: () => void };
type Started = Controls | readonly (Controls | null | undefined | false)[];

let loaded: Animate | null = null;
let pending: Promise<Animate> | null = null;

/** Starts loading `animate` (once). */
export function loadAnimate(): Promise<Animate> {
  pending ??= import("./animate-impl").then(
    (mod) => (loaded = mod.animate),
    (e) => {
      pending = null;
      throw e;
    },
  );
  return pending;
}

/** Preload for effects: `useEffect(preloadAnimate, [])`. */
export function preloadAnimate(): void {
  void loadAnimate().catch(() => {});
}

/**
 * Runs `start(animate)` now when `animate` is loaded, otherwise as soon as it loads (unless
 * stopped first). The returned `stop()` cancels a pending start and stops what started.
 */
export function withAnimate(start: (animate: Animate) => Started): Controls {
  let stopped = false;
  let running: Controls[] = [];
  const run = (animate: Animate) => {
    const out = start(animate);
    running = (Array.isArray(out) ? out : [out]).filter((c): c is Controls => Boolean(c));
  };
  if (loaded) run(loaded);
  else
    loadAnimate().then(
      (animate) => {
        if (!stopped) run(animate);
      },
      () => {},
    );
  return {
    stop() {
      stopped = true;
      running.forEach((c) => c.stop());
    },
  };
}
