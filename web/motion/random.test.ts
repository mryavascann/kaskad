import { describe, expect, it } from "vitest";
import { DEMO_SEED, mulberry32, pick, randomBetween, randomSeed } from "./random";

const take = (rng: () => number, n: number) => Array.from({ length: n }, () => rng());

describe("mulberry32", () => {
  it("is deterministic: the same seed gives the same sequence", () => {
    expect(take(mulberry32(DEMO_SEED), 50)).toEqual(take(mulberry32(DEMO_SEED), 50));
    expect(take(mulberry32(7), 5)).not.toEqual(take(mulberry32(8), 5));
  });

  it("matches the reference implementation (recordings stay reproducible across releases)", () => {
    const [a, b, c] = take(mulberry32(1), 3);
    expect(a).toBeCloseTo(0.627073940588, 12);
    expect(b).toBeCloseTo(0.00273572118, 12);
    expect(c).toBeCloseTo(0.52744703996, 12);
    const [d, e, f] = take(mulberry32(DEMO_SEED), 3);
    expect(d).toBeCloseTo(0.082489066059, 12);
    expect(e).toBeCloseTo(0.028055093484, 12);
    expect(f).toBeCloseTo(0.355968573363, 12);
  });

  it("returns floats in [0, 1) spread evenly", () => {
    const values = take(mulberry32(123), 20_000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
    const buckets = new Array(10).fill(0);
    for (const v of values) buckets[Math.floor(v * 10)]++;
    for (const count of buckets) expect(count).toBeGreaterThan(1800);
  });

  it("keeps working after millions of draws (state stays a 32-bit integer)", () => {
    const rng = mulberry32(DEMO_SEED);
    let last = 0;
    for (let i = 0; i < 2_000_000; i++) last = rng();
    expect(last).toBeGreaterThanOrEqual(0);
    expect(last).toBeLessThan(1);
  });
});

describe("randomBetween and pick", () => {
  it("stays within [min, max)", () => {
    const rng = mulberry32(DEMO_SEED);
    for (let i = 0; i < 1000; i++) {
      const v = randomBetween(rng, -60, 75);
      expect(v).toBeGreaterThanOrEqual(-60);
      expect(v).toBeLessThan(75);
    }
  });

  it("picks members deterministically and reaches all of them", () => {
    const items = ["calm", "warn", "liq"] as const;
    const sequence = (seed: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 30 }, () => pick(rng, items));
    };
    expect(sequence(99)).toEqual(sequence(99));
    const rng = mulberry32(5);
    const seen = new Set(Array.from({ length: 200 }, () => pick(rng, items)));
    expect([...seen].sort()).toEqual([...items].sort());
  });

  it("refuses to pick from an empty list", () => {
    expect(() => pick(mulberry32(1), [])).toThrow(RangeError);
  });
});

describe("randomSeed", () => {
  it("returns an unsigned 32-bit integer", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
