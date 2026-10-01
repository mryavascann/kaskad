import { describe, expect, it } from "vitest";
import { clamp, cubicBezier, ease, lerp, mapRange } from "./easing";
import { easing, type CubicBezier } from "./tokens";

/**
 * Independent numeric reference: sample the parametric curve densely, then find x by binary search
 * over the (monotonic) samples and interpolate y. No Newton, no shared code with the implementation.
 */
function reference([x1, y1, x2, y2]: CubicBezier, samples = 200_000) {
  const bez = (p1: number, p2: number, t: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
  const xs = new Float64Array(samples + 1);
  const ys = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    xs[i] = bez(x1, x2, t);
    ys[i] = bez(y1, y2, t);
  }
  return (x: number) => {
    let lo = 0;
    let hi = samples;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < x) lo = mid;
      else hi = mid;
    }
    const span = xs[hi] - xs[lo];
    const f = span === 0 ? 0 : (x - xs[lo]) / span;
    return ys[lo] + (ys[hi] - ys[lo]) * f;
  };
}

const grid = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

describe("cubicBezier", () => {
  it("hits both endpoints exactly and clamps input outside [0, 1]", () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBe(0);
      expect(fn(1), name).toBe(1);
      expect(fn(-0.5), name).toBe(0);
      expect(fn(1.5), name).toBe(1);
    }
  });

  it("is monotonic for every easing token", () => {
    for (const [name, fn] of Object.entries(ease)) {
      let previous = -Infinity;
      for (const x of grid(2000)) {
        const y = fn(x);
        expect(y, `${name}(${x})`).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = y;
      }
    }
  });

  it("is symmetric for inOutQuart and the identity for linear", () => {
    expect(ease.inOutQuart(0.5)).toBeCloseTo(0.5, 9);
    for (const x of grid(20)) {
      expect(ease.inOutQuart(x) + ease.inOutQuart(1 - x)).toBeCloseTo(1, 6);
      expect(ease.linear(x)).toBeCloseTo(x, 12);
    }
  });

  it("agrees with a numeric reference within 1e-3", () => {
    for (const [name, curve] of Object.entries(easing)) {
      const ref = reference(curve);
      const fn = ease[name as keyof typeof ease];
      for (const x of grid(400)) expect(Math.abs(fn(x) - ref(x)), `${name}(${x})`).toBeLessThan(1e-3);
    }
  });

  it("stays robust where the curve is flat (bisection fallback) and for overshooting curves", () => {
    // x'(t) = 0 at t = 0.5: Newton stalls there and bisection has to take over.
    const flat = cubicBezier(1, 0, 0, 1);
    expect(flat(0.5)).toBeCloseTo(0.5, 6);
    const flatRef = reference([1, 0, 0, 1]);
    for (const x of grid(200)) expect(Math.abs(flat(x) - flatRef(x))).toBeLessThan(1e-3);

    // "back out" style: y leaves [0, 1] but x still maps exactly.
    const back = cubicBezier(0.34, 1.56, 0.64, 1);
    const backRef = reference([0.34, 1.56, 0.64, 1]);
    expect(Math.max(...grid(200).map(back))).toBeGreaterThan(1);
    for (const x of grid(200)) expect(Math.abs(back(x) - backRef(x))).toBeLessThan(1e-3);
  });

  it("matches the known CSS keyword curves", () => {
    // `ease-in-out` = cubic-bezier(0.42, 0, 0.58, 1): symmetric around the midpoint.
    const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(0.25)).toBeCloseTo(1 - easeInOut(0.75), 9);
  });

  it("rejects control points whose x lies outside [0, 1]", () => {
    expect(() => cubicBezier(-0.1, 0, 0.5, 1)).toThrow(RangeError);
    expect(() => cubicBezier(0.5, 0, 1.2, 1)).toThrow(RangeError);
  });

  it("builds one function per easing token", () => {
    expect(Object.keys(ease).sort()).toEqual(Object.keys(easing).sort());
    // outExpo front-loads the motion, inQuart back-loads it.
    expect(ease.outExpo(0.2)).toBeGreaterThan(0.6);
    expect(ease.inQuart(0.5)).toBeLessThan(0.2);
  });
});

describe("clamp, lerp, mapRange", () => {
  it("clamps to [0, 1] by default and to a custom range", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.4)).toBe(0.4);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("interpolates and extrapolates linearly", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 1.5)).toBe(25);
  });

  it("maps between ranges, optionally clamped, and survives an empty input range", () => {
    expect(mapRange(5, 0, 10, 100, 200)).toBe(150);
    expect(mapRange(15, 0, 10, 100, 200)).toBe(250);
    expect(mapRange(15, 0, 10, 100, 200, true)).toBe(200);
    expect(mapRange(0.25, 0, 1, 1, 0)).toBe(0.75);
    expect(mapRange(3, 3, 3, 7, 9)).toBe(7);
  });
});
