/** Shared pieces of the Motion-based primitives (Reveal, Stagger). Client-only. */
import { motion } from "motion/react";

/** Elements Reveal, Stagger and StaggerItem can render as. */
export const motionTags = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  aside: motion.aside,
  header: motion.header,
  footer: motion.footer,
  figure: motion.figure,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  p: motion.p,
  span: motion.span,
  h2: motion.h2,
  h3: motion.h3,
} as const;

export type MotionTag = keyof typeof motionTags;

/** The props of these tags are compatible, so the components are typed as `motion.div`. */
export type MotionElement = typeof motion.div;

/**
 * Entrance travel. A CSS variable, not a number: it is 12px normally and 0px under
 * `prefers-reduced-motion` (motion/tokens.css), so even the server-rendered hidden state is right.
 */
export const RISE = "var(--rise)";

/** In-view line pulled 10 % up from the bottom edge: things reveal once they are really on screen. */
export const VIEWPORT_MARGIN = "0px 0px -10% 0px";

/** How much of the element must be visible: "some" (any pixel), "all", or a fraction 0–1. */
export type ViewportAmount = "some" | "all" | number;
