"use client";

/**
 * Lenis smooth scrolling for one page (the landing), synced with ScrollTrigger through the GSAP
 * ticker. Mount it inside the page that wants it; it tears down on navigation. Off under reduced
 * motion (OS setting or a forced MotionConfig); Lenis leaves native touch scrolling alone. Both
 * libraries load after hydration, so first paint never waits for them.
 */
import { useEffect } from "react";
import { useShouldReduceMotion } from "./hooks";
import { loadScrollKit } from "./scroll";
import "./smooth-scroll.css";

export type SmoothScrollProps = {
  /** Lenis lerp (0–1): lower is smoother. Default 0.1. */
  lerp?: number;
};

export function SmoothScroll({ lerp = 0.1 }: SmoothScrollProps) {
  const reduce = useShouldReduceMotion();

  useEffect(() => {
    if (reduce) return;
    let cancelled = false;
    let teardown: (() => void) | null = null;
    Promise.all([import("lenis"), loadScrollKit()])
      .then(([{ default: Lenis }, { gsap, ScrollTrigger }]) => {
        if (cancelled) return;
        const lenis = new Lenis({ lerp, anchors: true, autoRaf: false });
        const onScroll = () => ScrollTrigger.update();
        const raf = (time: number) => lenis.raf(time * 1000);
        lenis.on("scroll", onScroll);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);
        teardown = () => {
          gsap.ticker.remove(raf);
          lenis.off("scroll", onScroll);
          lenis.destroy();
        };
      })
      .catch(() => {
        // Native scrolling keeps working.
      });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [reduce, lerp]);

  return null;
}
