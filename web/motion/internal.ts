/**
 * Shared pieces of the Motion-based primitives (Reveal, Stagger). Client-only. They render `m.*`
 * (features come from `LazyMotion` in `MotionProvider`), not the full `motion.*` bundle.
 */
import { m } from "motion/react";

/** Elements Reveal, Stagger and StaggerItem can render as. */
export const motionTags = {
  div: m.div,
  section: m.section,
  article: m.article,
  aside: m.aside,
  header: m.header,
  footer: m.footer,
  figure: m.figure,
  ul: m.ul,
  ol: m.ol,
  li: m.li,
  p: m.p,
  span: m.span,
  h2: m.h2,
  h3: m.h3,
} as const;

export type MotionTag = keyof typeof motionTags;

/** The props of these tags are compatible, so the components are typed as `m.div`. */
export type MotionElement = typeof m.div;

/**
 * Entrance travel. A CSS variable, not a number: it is 12px normally and 0px under
 * `prefers-reduced-motion` (motion/tokens.css), so even the server-rendered hidden state is right.
 */
export const RISE = "var(--rise)";

/** In-view line pulled 10 % up from the bottom edge: things reveal once they are really on screen. */
export const VIEWPORT_MARGIN = "0px 0px -10% 0px";

/** How much of the element must be visible: "some" (any pixel), "all", or a fraction 0–1. */
export type ViewportAmount = "some" | "all" | number;
