import { describe, expect, it } from "vitest";
import {
  buildHeroModel,
  contactAngle,
  DEFAULT_PLACEHOLDER_COUNT,
  DOMINO,
  dominoCorners,
  fallAt,
  heightFor,
  LAST_TIP,
  landingBounce,
  poseAt,
  quadsOverlap,
  SPACING,
  STUCK_LEAN,
  TIMING,
  warmthAt,
  type HeroPosition,
} from "./model";

const HALF_PI = Math.PI / 2;

/** A small book: 3 stuck, 1 liquidated, 1 bad debt, 3 safe, in row order. */
const BOOK: HeroPosition[] = [
  { order: 0, debtUsd: 2_000_000, outcome: "stuck", tipAt: 0.05, hitAt: 0.05, thresholdAt: 0.03 },
  { order: 1, debtUsd: 500_000, outcome: "stuck", tipAt: 0.3, thresholdAt: 0.28 },
  { order: 2, debtUsd: 30_000_000, outcome: "stuck", tipAt: 0.4, thresholdAt: 0.38 },
  { order: 3, debtUsd: 80_000, outcome: "liquidated", tipAt: 0.5, hitAt: 0.5, thresholdAt: 0.47 },
  { order: 4, debtUsd: 1_000_000, outcome: "bad-debt", tipAt: 0.6, thresholdAt: 0.58 },
  { order: 5, debtUsd: 4_000_000, outcome: "safe", thresholdAt: 1.2 },
  { order: 6, debtUsd: 10_000, outcome: "safe", thresholdAt: null },
  { order: 7, debtUsd: 0, outcome: "safe" },
];

const overlapsNext = (model: ReturnType<typeof buildHeroModel>, angles: ArrayLike<number>, i: number) => {
  const a = model.dominoes[i];
  const b = model.dominoes[i + 1];
  return quadsOverlap(dominoCorners(a.x, a.height, angles[i]), dominoCorners(b.x, b.height, angles[i + 1]));
};

describe("heightFor", () => {
  it("spans minHeight (no debt) to maxHeight (the largest debt)", () => {
    expect(heightFor(30e6, 30e6)).toBe(DOMINO.maxHeight);
    expect(heightFor(0, 30e6)).toBe(DOMINO.minHeight);
    expect(heightFor(-5, 30e6)).toBe(DOMINO.minHeight);
    expect(heightFor(Number.NaN, 30e6)).toBe(DOMINO.minHeight);
    expect(heightFor(1e6, 0)).toBe(DOMINO.minHeight);
  });

  it("grows with debt", () => {
    const debts = [1, 100, 10_000, 1e6, 5e6, 30e6];
    const heights = debts.map((d) => heightFor(d, 30e6));
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]);
  });

  it("compresses: each decade below the largest takes about the same step", () => {
    const max = 1e8;
    const step1 = heightFor(max, max) - heightFor(max / 10, max);
    const step2 = heightFor(max / 10, max) - heightFor(max / 100, max);
    expect(step1).toBeGreaterThan(0);
    expect(step2 / step1).toBeGreaterThan(0.85);
    expect(step2 / step1).toBeLessThan(1.15);
    // A borrower 100× smaller still keeps more than half of the range.
    expect(heightFor(max / 100, max)).toBeGreaterThan((DOMINO.minHeight + DOMINO.maxHeight) / 2);
  });
});

describe("buildHeroModel", () => {
  it("draws a neutral, upright row without data", () => {
    const model = buildHeroModel(undefined);
    expect(model.neutral).toBe(true);
    expect(model.dominoes).toHaveLength(DEFAULT_PLACEHOLDER_COUNT);
    expect(buildHeroModel([], { placeholderCount: 57 }).dominoes).toHaveLength(57);
    for (const d of model.dominoes) {
      expect(d.kind).toBe("neutral");
      expect(d.height).toBe(DOMINO.neutralHeight);
      expect(d.tipAt).toBeNull();
      expect(d.rest).toBe(0);
    }
    expect([...poseAt(model, 1)].every((a) => a === 0)).toBe(true);
  });

  it("lays one domino per position in row order, evenly spaced", () => {
    const shuffled = [BOOK[4], BOOK[0], BOOK[7], BOOK[2], BOOK[1], BOOK[6], BOOK[3], BOOK[5]];
    const model = buildHeroModel(shuffled);
    expect(model.neutral).toBe(false);
    expect(model.dominoes.map((d) => d.debtUsd)).toEqual(BOOK.map((p) => p.debtUsd));
    model.dominoes.forEach((d, i) => expect(d.x).toBeCloseTo(i * SPACING, 12));
    expect(model.length).toBeCloseTo((BOOK.length - 1) * SPACING, 12);
  });

  it("never moves a safe position, even with a tip time", () => {
    const model = buildHeroModel([{ order: 0, debtUsd: 1, outcome: "safe", tipAt: 0.2, hitAt: 0.2 }, ...BOOK.slice(1)]);
    expect(model.dominoes[0].tipAt).toBeNull();
    expect(model.dominoes[0].hitAt).toBeNull();
    expect(model.dominoes[0].rest).toBe(0);
  });

  it("derives a schedule in row order when tip times are missing, and clamps them", () => {
    const model = buildHeroModel([
      { order: 0, debtUsd: 1, outcome: "stuck" },
      { order: 1, debtUsd: 1, outcome: "bad-debt" },
      { order: 2, debtUsd: 1, outcome: "stuck", tipAt: 5 },
      { order: 3, debtUsd: 1, outcome: "safe" },
    ]);
    expect(model.dominoes[0].tipAt).toBe(0);
    expect(model.dominoes[1].tipAt).toBeCloseTo(LAST_TIP / 2, 12);
    expect(model.dominoes[2].tipAt).toBe(LAST_TIP);
  });

  it("freezes stuck dominoes at a lean and lets falling ones rest on the next", () => {
    const model = buildHeroModel(BOOK);
    const [s0, s1, s2, liq, bad, safe] = model.dominoes;
    for (const d of [s0, s1, s2]) {
      expect(d.rest).toBeGreaterThan(0);
      expect(d.rest).toBeLessThanOrEqual(STUCK_LEAN + 1e-12);
    }
    // The bad-debt domino leans on the first safe one, which stays upright.
    expect(safe.rest).toBe(0);
    expect(bad.rest).toBeGreaterThan(0);
    expect(bad.rest).toBeLessThan(HALF_PI);
    // Resting means touching: a hair further and it would cut into its neighbour.
    const angles = model.dominoes.map((d) => d.rest);
    expect(overlapsNext(model, angles, 4)).toBe(false);
    const deeper = [...angles];
    deeper[4] += 0.002;
    expect(overlapsNext(model, deeper, 4)).toBe(true);
    expect(liq.rest).toBeGreaterThan(0);
  });

  it("lays the last domino flat when nothing is in front of it", () => {
    const model = buildHeroModel([
      { order: 0, debtUsd: 1e6, outcome: "safe" },
      { order: 1, debtUsd: 1e6, outcome: "liquidated", tipAt: 0.2 },
    ]);
    expect(model.dominoes[1].rest).toBeCloseTo(HALF_PI, 12);
    const neighbours = [0, 0];
    expect(contactAngle(model.dominoes, neighbours, 1)).toBeCloseTo(HALF_PI, 12);
  });

  it("lands a domino no later than the end of its fall", () => {
    const model = buildHeroModel(BOOK);
    for (const d of model.dominoes) {
      if (d.tipAt === null) expect(d.landAt).toBeNull();
      else {
        expect(d.landAt).toBeGreaterThan(d.tipAt);
        expect(d.landAt).toBeLessThanOrEqual(d.tipAt + TIMING.fall + 1e-12);
      }
    }
  });
});

describe("poseAt", () => {
  const model = buildHeroModel(BOOK);

  it("keeps every domino upright before it tips", () => {
    const angles = poseAt(model, 0.04);
    expect([...angles].every((a) => a === 0)).toBe(true);
    expect(poseAt(model, 0.29)[1]).toBe(0);
  });

  it("falls with ease.inQuart: slow start, accelerating", () => {
    const d = model.dominoes[2];
    const tip = d.tipAt ?? 0;
    const at = (u: number) => poseAt(model, tip + u * TIMING.fall)[2];
    const early = at(0.25);
    const mid = at(0.5);
    expect(early).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(early);
    // Accelerating: the second quarter covers more angle than the first.
    expect(mid - early).toBeGreaterThan(early);
  });

  it("ends at the resting pose once everything has settled", () => {
    const angles = poseAt(model, 1);
    model.dominoes.forEach((d, i) => expect(angles[i]).toBeCloseTo(d.rest, 6));
  });

  it("bounces back once with the impact spring when a domino lands", () => {
    const d = model.dominoes[4];
    const land = d.landAt ?? 0;
    const bounce = poseAt(model, land + 0.05 / TIMING.seconds)[4];
    expect(bounce).toBeLessThan(d.rest);
    expect(bounce).toBeGreaterThan(d.rest * (1 - TIMING.rebound) - 1e-9);
  });

  it("tips dominoes in row order", () => {
    const firstMove = model.dominoes.map((_, i) => {
      for (let p = 0; p <= 1; p += 0.001) if (poseAt(model, p)[i] > 1e-6) return p;
      return Infinity;
    });
    const moving = firstMove.filter(Number.isFinite);
    expect(moving).toHaveLength(5);
    for (let i = 1; i < moving.length; i++) expect(moving[i]).toBeGreaterThan(moving[i - 1]);
    expect(firstMove.slice(5).every((p) => p === Infinity)).toBe(true);
  });

  it("never lets a domino cut into its neighbour", () => {
    for (let p = 0; p <= 1; p += 0.0025) {
      const angles = poseAt(model, p);
      for (let i = 0; i < model.dominoes.length - 1; i++) expect(overlapsNext(model, angles, i)).toBe(false);
    }
  });

  it("is deterministic and reuses the output buffer", () => {
    const a = poseAt(model, 0.537);
    const b = poseAt(model, 0.537);
    expect([...a]).toEqual([...b]);
    const buffer = new Float64Array(model.dominoes.length);
    expect(poseAt(model, 0.537, buffer)).toBe(buffer);
    expect([...buffer]).toEqual([...a]);
  });

  it("clamps progress outside 0–1", () => {
    expect([...poseAt(model, -1)]).toEqual([...poseAt(model, 0)]);
    expect([...poseAt(model, 2)]).toEqual([...poseAt(model, 1)]);
  });
});

describe("landingBounce", () => {
  it("starts at 0, peaks at 1 and dies out", () => {
    expect(landingBounce(0)).toBe(0);
    expect(landingBounce(-1)).toBe(0);
    let peak = 0;
    for (let t = 0; t < 0.3; t += 0.001) peak = Math.max(peak, landingBounce(t));
    expect(peak).toBeCloseTo(1, 2);
    expect(landingBounce(0.6)).toBeLessThan(0.02);
    for (let t = 0; t < 1; t += 0.01) expect(landingBounce(t)).toBeGreaterThanOrEqual(0);
  });
});

describe("warmthAt / fallAt", () => {
  const [d] = buildHeroModel(BOOK).dominoes;

  it("warms up over the window before the threshold", () => {
    const threshold = d.thresholdAt ?? 0;
    expect(warmthAt(d, threshold - TIMING.warmWindow - 0.01)).toBe(0);
    expect(warmthAt(d, threshold)).toBe(1);
    expect(warmthAt(d, threshold - TIMING.warmWindow / 2)).toBeCloseTo(0.5, 6);
    expect(warmthAt({ ...d, thresholdAt: null }, 1)).toBe(0);
  });

  it("reports how far a domino is into its fall", () => {
    const tip = d.tipAt ?? 0;
    expect(fallAt(d, tip - 0.01)).toBe(0);
    expect(fallAt(d, tip + TIMING.fall / 2)).toBeCloseTo(0.5, 9);
    expect(fallAt(d, tip + TIMING.fall * 2)).toBe(1);
    expect(fallAt({ ...d, tipAt: null }, 1)).toBe(0);
  });
});
