"use client";

/**
 * Reveal: a below-the-fold entrance, played once when the element scrolls into view
 * (opacity 0 → 1, y `--rise` → 0, `transition.slow`). Reduced motion: opacity only.
 *
 * Above the fold, do NOT use Reveal: its hidden state is server-rendered and only lifts after
 * hydration, which delays LCP. Use the CSS utility `animate-rise` (or `SplitText` for headlines)
 * instead; it plays at first paint without waiting for JavaScript.
 *
 * Without JavaScript the hidden state would stay: mount `<RevealNoScript />` once in the root
 * layout, it un-hides every `[data-reveal]` element (Reveal and StaggerItem).
 */
import type { HTMLMotionProps } from "motion/react";
import { useForcedReducedMotion } from "./hooks";
import { motionTags, RISE, VIEWPORT_MARGIN, type MotionElement, type MotionTag, type ViewportAmount } from "./internal";
import { toSeconds, transition } from "./tokens";

type OwnedProps = "initial" | "animate" | "exit" | "whileInView" | "viewport" | "transition" | "variants";

export type RevealProps = Omit<HTMLMotionProps<"div">, OwnedProps> & {
  /** Element to render. Default `div`. */
  as?: MotionTag;
  /** Delay in ms after the element enters the view (use `beat.*` or multiples of `stagger.*`). */
  delay?: number;
  /** Play once (default) or every time the element enters the view. */
  once?: boolean;
  /** Visible share that triggers it: "some" (default), "all" or 0–1. */
  amount?: ViewportAmount;
};

export function Reveal({ as = "div", delay = 0, once = true, amount = "some", ...props }: RevealProps) {
  const Component = motionTags[as] as MotionElement;
  const forced = useForcedReducedMotion();
  return (
    <Component
      data-reveal=""
      initial={{ opacity: 0, y: forced ? 0 : RISE }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount, margin: VIEWPORT_MARGIN }}
      transition={{ ...transition.slow, delay: toSeconds(delay) }}
      {...props}
    />
  );
}

/** Re-exported for existing imports; the root layout imports `./reveal-noscript` (server) directly. */
export { RevealNoScript } from "./reveal-noscript";
