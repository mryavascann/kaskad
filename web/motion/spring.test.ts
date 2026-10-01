import { describe, expect, it } from "vitest";
import { naturalFrequency, springOvershoot, springPeakTime, springSettleTime, springStep } from "./spring";
import { spring, type SpringToken } from "./tokens";

/** Numeric reference: RK4 integration of m·x'' + c·x' + k·(x − 1) = 0 from rest at x = 0. */
function integrate(s: SpringToken, until: number, dt = 1e-4) {
  const samples = new Map<number, number>();
  let x = 0;
  let v = 0;
  const accel = (px: number, pv: number) => (-s.stiffness * (px - 1) - s.damping * pv) / s.mass;
  const steps = Math.round(until / dt);
  for (let i = 1; i <= steps; i++) {
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = accel(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = accel(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = accel(x + dt * k3x, v + dt * k3v);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    if (i % 100 === 0) samples.set(Math.round(i * dt * 100) / 100, x);
  }
  return samples;
}

const critical: SpringToken = { type: "spring", stiffness: 100, damping: 20, mass: 1 };
const overdamped: SpringToken = { type: "spring", stiffness: 100, damping: 60, mass: 1 };

describe("springStep", () => {
  it("matches a numeric integration for every spring token and every damping regime", () => {
    for (const [name, s] of [...Object.entries(spring), ["critical", critical], ["overdamped", overdamped]] as const) {
      for (const [t, x] of integrate(s, 2)) expect(Math.abs(springStep(s, t) - x), `${name} @ ${t}s`).toBeLessThan(1e-3);
    }
  });

  it("starts at 0 and settles on 1", () => {
    for (const s of Object.values(spring)) {
      expect(springStep(s, 0)).toBe(0);
      expect(springStep(s, -1)).toBe(0);
      expect(springStep(s, 10)).toBeCloseTo(1, 6);
    }
    expect(springStep(overdamped, 1000)).toBeCloseTo(1, 9);
  });
});

describe("spring characteristics", () => {
  it("computes ω₀ from stiffness and mass", () => {
    expect(naturalFrequency(spring.soft)).toBeCloseTo(Math.sqrt(260), 9);
    expect(naturalFrequency(spring.needle)).toBeCloseTo(Math.sqrt(140 / 0.6), 9);
  });

  it("gives soft no visible overshoot, impact a hard one and the needle the most", () => {
    expect(springOvershoot(spring.soft)).toBeLessThan(0.001);
    expect(springOvershoot(spring.impact)).toBeGreaterThan(0.15);
    expect(springOvershoot(spring.needle)).toBeGreaterThan(springOvershoot(spring.impact));
    expect(springOvershoot(critical)).toBe(0);
  });

  it("puts the first peak where the step response actually peaks", () => {
    for (const s of [spring.impact, spring.needle]) {
      const peak = springPeakTime(s);
      expect(springStep(s, peak)).toBeCloseTo(1 + springOvershoot(s), 9);
      expect(springStep(s, peak)).toBeGreaterThan(springStep(s, peak - 0.01));
      expect(springStep(s, peak)).toBeGreaterThan(springStep(s, peak + 0.01));
    }
    expect(springPeakTime(overdamped)).toBe(Infinity);
  });

  it("settles fastest for soft and slowest for the trembling needle", () => {
    const soft = springSettleTime(spring.soft);
    const impact = springSettleTime(spring.impact);
    const needle = springSettleTime(spring.needle);
    expect(soft).toBeLessThan(impact);
    expect(impact).toBeLessThan(needle);
    expect(needle).toBeLessThan(1.2);
    // After the settling time the spring really stays inside the band.
    for (let t = needle; t < needle + 1; t += 0.005) expect(Math.abs(springStep(spring.needle, t) - 1)).toBeLessThanOrEqual(0.02);
  });
});
