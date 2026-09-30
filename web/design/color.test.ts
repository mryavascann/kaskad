import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  formatOklch,
  hexToSrgb,
  inSrgbGamut,
  oklchToHex,
  parseOklch,
  srgbToOklch,
} from "./color";

describe("parseOklch / formatOklch", () => {
  it("parses plain, percentage and alpha forms", () => {
    expect(parseOklch("oklch(0.66 0.22 25)")).toEqual({ l: 0.66, c: 0.22, h: 25, alpha: 1 });
    expect(parseOklch("oklch(66% 0.22 25deg / 50%)")).toEqual({ l: 0.66, c: 0.22, h: 25, alpha: 0.5 });
    expect(parseOklch(" oklch(1 0 0 / 0.08) ")).toEqual({ l: 1, c: 0, h: 0, alpha: 0.08 });
  });

  it("rejects other color syntaxes", () => {
    expect(() => parseOklch("#ff0000")).toThrow();
    expect(() => parseOklch("rgb(1 2 3)")).toThrow();
  });

  it("round-trips through formatOklch", () => {
    const text = "oklch(0.629 0.199 286 / 0.45)";
    expect(formatOklch(parseOklch(text))).toBe(text);
  });
});

describe("conversions", () => {
  it("maps the achromatic extremes exactly", () => {
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
  });

  it("matches the Monad brand purple", () => {
    // #836EF9 is Monad's purple; the design token is its OKLCH equivalent.
    const brand = srgbToOklch(hexToSrgb("#836EF9"));
    expect(brand.l).toBeCloseTo(0.629, 3);
    expect(brand.c).toBeCloseTo(0.199, 3);
    expect(brand.h).toBeCloseTo(286.1, 1);
    expect(oklchToHex("oklch(0.629 0.199 286)")).toBe("#836ef9");
  });

  it("round-trips sRGB -> OKLCH -> sRGB", () => {
    for (const hex of ["#fc4447", "#4ad496", "#93a7ba", "#0f0f19", "#fcb442"]) {
      expect(oklchToHex(srgbToOklch(hexToSrgb(hex)))).toBe(hex);
    }
  });

  it("detects out-of-gamut colors", () => {
    expect(inSrgbGamut(parseOklch("oklch(0.66 0.22 25)"))).toBe(true);
    expect(inSrgbGamut(parseOklch("oklch(0.9 0.3 145)"))).toBe(false);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 5);
    expect(contrastRatio("oklch(0.5 0.1 200)", "oklch(0.5 0.1 200)")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    const a = "oklch(0.8 0.012 285)";
    const b = "oklch(0.175 0.02 285)";
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it("composites translucent foregrounds over the background", () => {
    const bg = "oklch(0.145 0.018 285)";
    expect(contrastRatio("oklch(1 0 0 / 0)", bg)).toBeCloseTo(1, 5);
    const half = contrastRatio("oklch(1 0 0 / 0.5)", bg);
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(contrastRatio("oklch(1 0 0)", bg));
  });
});
