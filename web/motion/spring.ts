/**
 * Spring physics for the spring tokens: the same model Motion animates (mass, stiffness, damping,
 * released from rest), solved analytically. Use it to plot a spring, to know when it settles
 * (choreography), or to drive a canvas/WebGL value that must match a DOM spring.
 */
import { dampingRatio, type SpringToken } from "./tokens";

/** Undamped angular frequency ω₀ = √(k / m), in rad/s. */
export const naturalFrequency = (spring: SpringToken) => Math.sqrt(spring.stiffness / spring.mass);

/**
 * Step response: where a spring released at rest at 0 with target 1 is after `seconds`.
 * Under-, critically and over-damped cases; exact, not integrated.
 */
export function springStep(spring: SpringToken, seconds: number): number {
  if (seconds <= 0) return 0;
  const w0 = naturalFrequency(spring);
  const zeta = dampingRatio(spring);
  const t = seconds;

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);

  // Over-damped: two real, negative roots. Written with exponentials so large t cannot overflow.
  const root = w0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * w0 + root;
  const r2 = -zeta * w0 - root;
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** Peak overshoot past the target as a fraction of the travel (0.2 = 20 %). 0 when ζ ≥ 1. */
export function springOvershoot(spring: SpringToken): number {
  const zeta = dampingRatio(spring);
  return zeta < 1 ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)) : 0;
}

/** Time (s) of the first peak, where the overshoot happens. `Infinity` when ζ ≥ 1 (no peak). */
export function springPeakTime(spring: SpringToken): number {
  const zeta = dampingRatio(spring);
  if (zeta >= 1) return Infinity;
  return Math.PI / (naturalFrequency(spring) * Math.sqrt(1 - zeta * zeta));
}

/**
 * Settling time (s): after it, the spring stays within `tolerance` of its target (2 % by default).
 * Sampled at 1 ms over a 10 s horizon, which covers every sensible UI spring.
 */
export function springSettleTime(spring: SpringToken, tolerance = 0.02): number {
  const step = 0.001;
  let last = 0;
  for (let t = step; t <= 10; t += step) {
    if (Math.abs(springStep(spring, t) - 1) > tolerance) last = t;
  }
  return Math.round((last + step) * 1000) / 1000;
}
