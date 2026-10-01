"use client";

/**
 * Lenis smooth scrolling for one page (the landing). Mount it inside the page that wants it; it
 * tears down on navigation. Only with a fine pointer (mouse, trackpad: Lenis leaves touch scrolling
 * native anyway, so phones never download it), never under reduced motion (OS setting or a forced
 * MotionConfig), and only after the reader's first intent (`whenScrollIntent`: scroll, wheel, key,
 * mouse move), so nothing of it runs while the page loads. Lenis drives its own frame loop
 * (`autoRaf`) and scrolls the window, so native scroll listeners (`observeScrollProgress`) follow it.
 */
import { useEffect } from "react";
import { useFinePointer, useShouldReduceMotion } from "./hooks";
import { whenScrollIntent } from "./scroll";

export type SmoothScrollProps = {
  /** Lenis lerp (0–1): lower is smoother. Default 0.1. */
  lerp?: number;
};

export function SmoothScroll({ lerp = 0.1 }: SmoothScrollProps) {
  const reduce = useShouldReduceMotion();
  const fine = useFinePointer();

  useEffect(() => {
    if (reduce || !fine) return;
    let cancelled = false;
    let teardown: (() => void) | null = null;
    whenScrollIntent()
      .then(() => (cancelled ? null : import("lenis")))
      .then((mod) => {
        if (!mod || cancelled) return;
        const lenis = new mod.default({ lerp, anchors: true, autoRaf: true });
        teardown = () => lenis.destroy();
      })
      .catch(() => {
        // Native scrolling keeps working.
      });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [reduce, fine, lerp]);

  return null;
}
