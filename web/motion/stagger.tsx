"use client";

/**
 * Stagger + StaggerItem: siblings enter one after another (lists, tile grids, readout rows).
 * The container orchestrates, every StaggerItem below it (at any depth) rises and fades in with
 * `transition.slow`, `gap` ms apart. Reduced motion: items fade without travel.
 *
 * ```tsx
 * <Stagger as="ul" gap="tight">
 *   {rows.map((row) => <StaggerItem as="li" key={row.id}>…</StaggerItem>)}
 * </Stagger>
 * ```
 */
import { stagger as staggerChildren, type HTMLMotionProps, type Variants } from "motion/react";
import { useForcedReducedMotion } from "./hooks";
import { motionTags, RISE, VIEWPORT_MARGIN, type MotionElement, type MotionTag, type ViewportAmount } from "./internal";
import { stagger, toSeconds, transition } from "./tokens";

export type StaggerGap = keyof typeof stagger;

type OwnedProps = "initial" | "animate" | "exit" | "whileInView" | "viewport" | "transition" | "variants";

export type StaggerProps = Omit<HTMLMotionProps<"div">, OwnedProps> & {
  as?: MotionTag;
  /** Delay between siblings: tight 20 ms (dense grids), base 40 ms, loose 60 ms (few, large items). */
  gap?: StaggerGap;
  /** Delay in ms before the first item. */
  delay?: number;
  /** "view" (default): play when the container scrolls into view. "mount": play right away. */
  trigger?: "view" | "mount";
  /** With trigger "view": play once (default) or on every entry. */
  once?: boolean;
  /** With trigger "view": visible share that triggers it. */
  amount?: ViewportAmount;
};

export function Stagger({ as = "div", gap = "base", delay = 0, trigger = "view", once = true, amount = "some", ...props }: StaggerProps) {
  const Component = motionTags[as] as MotionElement;
  const variants: Variants = {
    hidden: {},
    visible: { transition: { delayChildren: staggerChildren(toSeconds(stagger[gap]), { startDelay: toSeconds(delay) }) } },
  };
  const play =
    trigger === "mount"
      ? { animate: "visible" }
      : { whileInView: "visible", viewport: { once, amount, margin: VIEWPORT_MARGIN } };
  return <Component data-stagger={gap} initial="hidden" variants={variants} {...play} {...props} />;
}

export type StaggerItemProps = Omit<HTMLMotionProps<"div">, OwnedProps> & { as?: MotionTag };

export function StaggerItem({ as = "div", ...props }: StaggerItemProps) {
  const Component = motionTags[as] as MotionElement;
  const forced = useForcedReducedMotion();
  const variants: Variants = {
    hidden: { opacity: 0, y: forced ? 0 : RISE },
    visible: { opacity: 1, y: 0, transition: transition.slow },
  };
  return <Component data-reveal="" variants={variants} {...props} />;
}
