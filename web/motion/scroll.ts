/**
 * Scroll-scene toolkit: GSAP + ScrollTrigger, loaded on demand. Nothing here runs at import time, so
 * a page that imports it pays nothing until a scene asks for the kit after hydration (the landing's
 * first paint never waits for GSAP). The promise is shared: every scene gets the same instances and
 * the plugin is registered once.
 */
import type { gsap as Gsap } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";

export type ScrollKit = { gsap: typeof Gsap; ScrollTrigger: typeof ScrollTriggerType };

let kit: Promise<ScrollKit> | null = null;

/** GSAP and ScrollTrigger, imported once (a separate chunk) and registered. */
export function loadScrollKit(): Promise<ScrollKit> {
  kit ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([core, st]) => {
    core.gsap.registerPlugin(st.ScrollTrigger);
    return { gsap: core.gsap, ScrollTrigger: st.ScrollTrigger };
  });
  return kit;
}

/** Test hook: forget the loaded kit (tests mock the modules per file). */
export function resetScrollKit() {
  kit = null;
}

/**
 * Linear sub-range of a 0–1 progress: 0 before `from`, 1 after `to`. Scenes split one scroll
 * progress into beats (copy out, panel in, loop drawn) with it.
 */
export function segment(progress: number, from: number, to: number): number {
  if (to <= from) return progress >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (progress - from) / (to - from)));
}
