import { describe, expect, it } from "vitest";
import { positionsOf, vizRun } from "./__fixtures__/data";
import { DOT_MAX, DOT_MIN, RINGS_VIEW, R_BEYOND, R_CENTER, R_MAX, dropRadius, ringDomain, ringsGeometry } from "./rings-model";

const sali = vizRun("sali");
const positions = positionsOf(sali);
const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

describe("ring scale", () => {
  it("picks an outer ring about 2.5× the shock", () => {
    expect(ringDomain(0.03)).toBe(0.1);
    expect(ringDomain(0.05)).toBe(0.2);
    expect(ringDomain(0.001)).toBe(0.02);
    expect(ringDomain(0.9)).toBe(1);
  });

  it("maps drops monotonically (square root) from the center to the last ring", () => {
    expect(dropRadius(0, 0.1)).toBe(R_CENTER);
    expect(dropRadius(-0.01, 0.1)).toBe(R_CENTER);
    expect(dropRadius(0.1, 0.1)).toBe(R_MAX);
    expect(dropRadius(0.5, 0.1)).toBe(R_MAX);
    expect(dropRadius(0.025, 0.1)).toBeCloseTo(R_CENTER + (R_MAX - R_CENTER) * 0.5, 1);
  });
});

describe("ringsGeometry on the recorded syrupUSDC book", () => {
  const g = ringsGeometry(positions, sali.shock);

  it("places every position exactly once, with rounded coordinates inside the view", () => {
    expect(g.dots).toHaveLength(positions.length);
    expect(new Set(g.dots.map((d) => d.index)).size).toBe(positions.length);
    for (const d of g.dots) {
      expect(decimals(d.cx)).toBeLessThanOrEqual(2);
      expect(decimals(d.cy)).toBeLessThanOrEqual(2);
      expect(d.cx).toBeGreaterThanOrEqual(0);
      expect(d.cx).toBeLessThanOrEqual(RINGS_VIEW);
    }
  });

  it("puts positions by their distance to liquidation, far ones on the outer band", () => {
    const c = RINGS_VIEW / 2;
    const radius = (i: number) => {
      const d = g.dots.find((x) => x.index === i);
      return d ? Math.hypot(d.cx - c, d.cy - c) : NaN;
    };
    const p12 = positions.find((p) => p.index === 12);
    expect(radius(12)).toBeCloseTo(dropRadius(p12?.thresholdDrop ?? 0, g.maxDrop), 0);
    const far = positions.filter((p) => p.thresholdDrop === null || p.thresholdDrop > g.maxDrop);
    expect(far.length).toBeGreaterThan(0);
    for (const p of far) expect(radius(p.index)).toBeCloseTo(R_BEYOND, 0);
    expect(g.dots.filter((d) => d.beyond)).toHaveLength(far.length);
  });

  it("sizes dots by debt (area), the largest borrower biggest", () => {
    const largest = positions.reduce((a, p) => (p.debtUsd > a.debtUsd ? p : a));
    const biggest = g.dots[0];
    expect(biggest.index).toBe(largest.index);
    expect(biggest.r).toBeCloseTo(DOT_MAX, 1);
    expect(Math.min(...g.dots.map((d) => d.r))).toBeGreaterThanOrEqual(DOT_MIN);
  });

  it("is deterministic and draws the shock ring at the scenario's shock", () => {
    expect(ringsGeometry(positions, sali.shock)).toEqual(g);
    expect(g.shockR).toBe(dropRadius(sali.shock, g.maxDrop));
    expect(g.rings.map((r) => r.drop)).toEqual([0.01, 0.02, 0.05, 0.1]);
  });
});
