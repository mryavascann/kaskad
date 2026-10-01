/**
 * Easing math for code that cannot hand a curve to CSS or Motion: canvas and WebGL scenes, SVG plots,
 * scroll-scrubbed values. `ease.*` is built from the easing tokens, so a JS-driven curve matches the
 * CSS `ease-*` utilities and Motion's `transition.*` exactly.
 */
import { easing } from "./tokens";

export type EasingFunction = (progress: number) => number;

const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 1e-6;
const BISECTION_ITERATIONS = 64;
const PRECISION = 1e-7;

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

/** Maps `value` from [inMin, inMax] onto [outMin, outMax]. Extrapolates unless `clamped`. */
export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number, clamped = false) {
  if (inMin === inMax) return outMin;
  const progress = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, clamped ? clamp(progress) : progress);
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress (a port of WebKit's UnitBezier):
 * Newton-Raphson on x(t), with a bisection fallback where the curve is flat. Endpoints are exact,
 * input outside [0, 1] is clamped, output may leave [0, 1] for overshooting curves.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new RangeError(`cubicBezier: x1 and x2 must be within [0, 1] (got ${x1}, ${x2})`);
  }
  if (x1 === y1 && x2 === y2) return (progress) => clamp(progress);

  // Polynomial coefficients of x(t) and y(t), from the control points (0,0), (x1,y1), (x2,y2), (1,1).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  /** Finds the curve parameter t for which x(t) = x. */
  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < PRECISION) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < NEWTON_MIN_SLOPE) break;
      t -= error / slope;
      if (t < 0 || t > 1) break;
    }
    // x(t) is monotonic on [0, 1] for x1, x2 in [0, 1], so bisection always converges.
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < PRECISION) return t;
      if (x > value) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (progress) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    return sampleY(solveT(progress));
  };
}

type EaseName = keyof typeof easing;

/** One function per easing token: `ease.outExpo(0.5)`. */
export const ease = Object.fromEntries(
  Object.entries(easing).map(([name, [x1, y1, x2, y2]]) => [name, cubicBezier(x1, y1, x2, y2)]),
) as Record<EaseName, EasingFunction>;
