"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import { useShouldReduceMotion } from "@/motion/hooks";
import { beat, duration, easing, toSeconds } from "@/motion/tokens";
import { useEnterView } from "./use-enter-view";
import { GapBarsView, type GapBarsProps } from "./gap-bars-view";

export { GAP_BARS_COPY, GapBarsStatic, type GapBarsCopy, type GapBarsProps } from "./gap-bars-view";

/**
 * Two bars on the same linear scale: what the pool lets a liquidator clear against the debt that
 * can't be liquidated instantly. The small one is a hairline (never thinner than 1px); the ratio is
 * computed from the two inputs. Bars grow when the figure scrolls into view (complete otherwise).
 * Markup: `GapBarsView` (./gap-bars-view.tsx, shared with the server-only `GapBarsStatic`).
 */
export function GapBars(props: GapBarsProps) {
  const root = useRef<HTMLElement>(null);
  const cleared = useRef<HTMLSpanElement>(null);
  const stuck = useRef<HTMLSpanElement>(null);
  const ratio = useRef<HTMLDivElement>(null);
  const entered = useEnterView(root);
  const reduce = useShouldReduceMotion();
  useEffect(() => {
    if (!entered || reduce) return;
    // Context first (the small bar), then the hero (the big one), the ratio last.
    const grow = { duration: toSeconds(duration.scene), ease: easing.outExpo };
    const runs = [
      cleared.current && animate(cleared.current, { scaleX: [0, 1] }, { ...grow, delay: toSeconds(beat.context) }),
      stuck.current && animate(stuck.current, { scaleX: [0, 1] }, { ...grow, delay: toSeconds(beat.hero) }),
      ratio.current && animate(ratio.current, { opacity: [0, 1] }, { duration: toSeconds(duration.slow), delay: toSeconds(beat.detail + duration.base) }),
    ];
    return () => runs.forEach((r) => r?.stop());
  }, [entered, reduce]);

  return <GapBarsView {...props} refs={{ root, cleared, stuck, ratio }} />;
}
