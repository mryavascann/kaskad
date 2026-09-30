"use client";

import { LazyMotion, MotionConfig, MotionConfigContext } from "motion/react";
import { useContext, type CSSProperties, type ReactNode } from "react";
import { transition } from "./tokens";

/**
 * Root motion config, mounted once in the root layout.
 * - `reducedMotion="user"`: Motion follows the OS setting (transforms jump, opacity still fades).
 *   Without it Motion's default is "never", and the reduced-motion hooks in `motion/hooks.ts` would
 *   ignore the OS setting.
 * - Default transition `transition.base` (240 ms, out-expo) for every `motion.*` without its own.
 * - `LazyMotion`: the feature bundle (`./features`, `domMax`) loads asynchronously after hydration,
 *   so `m.*` components (Reveal, Stagger, Magnetic, Tabs, Segmented) stay light in the initial JS.
 *   Not `strict`: a full `motion.*` component still works (it carries its own features, and its weight).
 *   Prefer `m.*` in anything that renders on many pages.
 */
const loadFeatures = () => import("./features").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={transition.base}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

const STILL = { "--nudge": "0px", "--rise": "0px", "--enter": "0px" } as CSSProperties;

type ReducedMotionScopeProps = {
  /** Force reduced motion for everything inside. */
  reduce: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Forces reduced motion on a subtree, for previews and the /design "Simulate reduced motion" switch:
 * Motion components get `reducedMotion="always"`, CSS travel vars (`--nudge`, `--rise`, `--enter`)
 * collapse to 0px and `data-motion="reduced"` lets CSS primitives (e.g. SplitText) switch to fades.
 * Toggling remounts the subtree, because Motion reads the config when a component mounts.
 */
export function ReducedMotionScope({ reduce, className, children }: ReducedMotionScopeProps) {
  const inherited = useContext(MotionConfigContext).reducedMotion;
  return (
    <MotionConfig reducedMotion={reduce ? "always" : inherited}>
      <div key={reduce ? "reduced" : "full"} data-motion={reduce ? "reduced" : undefined} className={className} style={reduce ? STILL : undefined}>
        {children}
      </div>
    </MotionConfig>
  );
}
