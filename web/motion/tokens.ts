/**
 * Motion tokens: one vocabulary for CSS transitions, Motion (`motion/react`), GSAP and canvas/WebGL.
 * Mirrored as CSS variables in `motion/tokens.css`; `motion/tokens.test.ts` fails when they drift.
 *
 * Rules
 * 1. Every animation explains data or causality (wave -> price drop -> next wave). No decoration.
 * 2. Choreography: context first, then the hero number, details last. At most two heroes move at once.
 * 3. Animate transform and opacity only; `will-change` only while a scroll scene is active.
 * 4. Reduced motion: no travel, parallax or 3D; short fades stay. The information stays complete.
 * 5. Interruptible: a new target retargets the running animation instead of restarting it.
 */

/** Durations in milliseconds. `scene` is the default for scene transitions (800–1400 range). */
export const duration = {
  instant: 80,
  fast: 160,
  base: 240,
  slow: 420,
  scene: 1100,
  sceneShort: 800,
  sceneLong: 1400,
} as const;

export type CubicBezier = readonly [number, number, number, number];

export const easing = {
  /** Entrances: fast start, long settle. */
  outExpo: [0.16, 1, 0.3, 1],
  /** Small UI responses: hover, press release, value changes. */
  outQuart: [0.25, 1, 0.5, 1],
  /** Scene transitions: symmetric and weighty. */
  inOutQuart: [0.76, 0, 0.24, 1],
  /** Exits and falling things (a domino tipping over). */
  inQuart: [0.5, 0, 0.75, 0],
  linear: [0, 0, 1, 1],
} as const satisfies Record<string, CubicBezier>;

export type SpringToken = { readonly type: "spring"; readonly stiffness: number; readonly damping: number; readonly mass: number };

export const spring = {
  /** Default UI settle, close to critical damping (no visible overshoot). */
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
  /** The shock moment: fast, with a hard overshoot. */
  impact: { type: "spring", stiffness: 600, damping: 22, mass: 1 },
  /** Gauge needle: trembles like a seismograph, then settles. */
  needle: { type: "spring", stiffness: 140, damping: 7, mass: 0.6 },
} as const satisfies Record<string, SpringToken>;

/** Delay between siblings in lists and tile grids (ms). */
export const stagger = { tight: 20, base: 40, loose: 60 } as const;

/** Choreography beats (ms from the start of a sequence): context, then the hero number, then details. */
export const beat = { context: 0, hero: 160, detail: 420 } as const;

/** Travel distances in px. Collapsed to 0 under reduced motion (see tokens.css). */
export const distance = { nudge: 4, rise: 12, enter: 24 } as const;

export const toSeconds = (ms: number) => ms / 1000;

export const cssEasing = (e: CubicBezier) => `cubic-bezier(${e.join(", ")})`;

/** Damping ratio ζ of a spring token: < 1 overshoots, ≈ 1 settles without overshoot. */
export const dampingRatio = (s: SpringToken) => s.damping / (2 * Math.sqrt(s.stiffness * s.mass));

/** Ready-made transitions for `motion/react`. */
export const transition = {
  fast: { duration: toSeconds(duration.fast), ease: easing.outQuart },
  base: { duration: toSeconds(duration.base), ease: easing.outExpo },
  slow: { duration: toSeconds(duration.slow), ease: easing.outExpo },
  scene: { duration: toSeconds(duration.scene), ease: easing.inOutQuart },
  fall: { duration: toSeconds(duration.slow), ease: easing.inQuart },
  soft: spring.soft,
  impact: spring.impact,
  needle: spring.needle,
} as const;
