import { describe, expect, it } from "vitest";
import { segment } from "./scroll";

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
