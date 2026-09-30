import { describe, expect, it } from "vitest";
import { edgeOffset, progressBetween, scrollAt, segment } from "./scroll";

describe("segment", () => {
  it("maps a sub-range of the progress to 0–1 and clamps outside it", () => {
    expect(segment(0, 0.2, 0.6)).toBe(0);
    expect(segment(0.2, 0.2, 0.6)).toBe(0);
    expect(segment(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(segment(0.6, 0.2, 0.6)).toBe(1);
    expect(segment(1, 0.2, 0.6)).toBe(1);
  });

  it("treats an empty range as a step", () => {
    expect(segment(0.49, 0.5, 0.5)).toBe(0);
    expect(segment(0.5, 0.5, 0.5)).toBe(1);
  });
});

describe("scroll positions", () => {
  it("reads '<element edge> <viewport edge>' like ScrollTrigger", () => {
    // Element 2,000 px tall at y = 500, viewport 800 px.
    expect(scrollAt("top top", 500, 2000, 800)).toBe(500);
    expect(scrollAt("bottom bottom", 500, 2000, 800)).toBe(1700);
    expect(scrollAt("top 80%", 500, 2000, 800)).toBe(-140);
    expect(scrollAt("center center", 500, 2000, 800)).toBe(1100);
    expect(scrollAt("top 100px", 500, 2000, 800)).toBe(400);
    expect(edgeOffset("nonsense", 100)).toBe(0);
  });

  it("maps scrollY to 0–1 between two positions, clamped", () => {
    expect(progressBetween(400, 500, 1700)).toBe(0);
    expect(progressBetween(1100, 500, 1700)).toBeCloseTo(0.5);
    expect(progressBetween(2000, 500, 1700)).toBe(1);
    expect(progressBetween(10, 20, 20)).toBe(0);
    expect(progressBetween(20, 20, 20)).toBe(1);
  });
});
