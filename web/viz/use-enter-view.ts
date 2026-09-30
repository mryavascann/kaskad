"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True once the element scrolls into view AFTER mount. An element that is already visible when the
 * page loads never "enters": it shows its complete, server-rendered state and plays nothing, so an
 * entrance never resets something the reader is already looking at. Without IntersectionObserver
 * (tests, old browsers) it stays false: static.
 */
export function useEnterView(ref: RefObject<Element | null>, threshold = 0): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let initial = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        const first = initial;
        initial = false;
        if (!entry?.isIntersecting) return;
        io.disconnect();
        if (!first) setEntered(true);
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return entered;
}
