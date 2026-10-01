"use client";

/**
 * Guard teaser: the two demo markets as the server read them (`readMarkets`, no poll here). The
 * server render and no-JS show the real state (`GuardTeaserStatic`, ./guard-cards.tsx). Once this
 * live teaser takes over (after the reader's first intent), a tripped breaker is re-armed on screen
 * until the cards scroll into view, then drops to the state that was read (it never shows a state
 * the chain didn't report once in view). Reduced motion: the read state, no lever travel. Which
 * market is guarded comes from the server (`MARKETS` of lib/chain/guard), so this chunk carries no viem.
 */
import { useEffect, useRef, useState } from "react";
import { useShouldReduceMotion } from "@/motion/hooks";
import { GuardCards, type GuardTeaserProps } from "./guard-cards";

export function GuardTeaser({ locale, markets, guarded }: GuardTeaserProps) {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useShouldReduceMotion();
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || reduce || !markets?.b.paused || typeof IntersectionObserver === "undefined") return;
    let first = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        const initial = first;
        first = false;
        if (initial && !entry?.isIntersecting) {
          setHeld(true);
          return;
        }
        if (entry?.isIntersecting) {
          io.disconnect();
          // Let the armed lever paint once before it drops.
          window.setTimeout(() => setHeld(false), 450);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, markets?.b.paused]);

  return <GuardCards locale={locale} markets={markets} guarded={guarded} held={held} rootRef={root} />;
}
