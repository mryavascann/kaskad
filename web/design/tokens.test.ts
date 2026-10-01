import { describe, expect, it } from "vitest";
import { contrastRatio, inSrgbGamut, parseOklch } from "./color";
import { color, colorGroups, colorRole, hex, type, type ColorToken } from "./tokens";
import { readCustomProperties } from "@/tests/helpers/css-vars";

const css = readCustomProperties(new URL("./tokens.css", import.meta.url));
const surfaces: ColorToken[] = ["bg", "elev-1", "elev-2", "elev-3"];

describe("tokens.css <-> tokens.ts", () => {
  it("mirrors every color token", () => {
    for (const [name, value] of Object.entries(color)) expect(css.get(`color-${name}`), name).toBe(value);
  });

  it("declares no color that the TS mirror lacks", () => {
    const cssColors = [...css.keys()].filter((k) => k.startsWith("color-") && k !== "color-*").map((k) => k.slice(6));
    expect(cssColors.sort()).toEqual(Object.keys(color).sort());
  });

  it("mirrors the type scale", () => {
    for (const [name, t] of Object.entries(type)) {
      expect(css.get(`text-${name}`), name).toBe(t.size);
      expect(css.get(`text-${name}--line-height`), `${name} line-height`).toBe(t.lineHeight);
      if ("letterSpacing" in t) expect(css.get(`text-${name}--letter-spacing`), `${name} tracking`).toBe(t.letterSpacing);
      if ("fontWeight" in t) expect(css.get(`text-${name}--font-weight`), `${name} weight`).toBe(t.fontWeight);
    }
  });

  it("documents a role for every color and puts each in exactly one group", () => {
    const grouped = Object.values(colorGroups).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(color).sort());
    for (const name of Object.keys(color)) expect(colorRole[name as ColorToken]).toBeTruthy();
  });
});

describe("color quality", () => {
  it("keeps every opaque token inside the sRGB gamut", () => {
    for (const [name, value] of Object.entries(color)) {
      const c = parseOklch(value);
      if ((c.alpha ?? 1) < 1) continue;
      expect(inSrgbGamut(c), name).toBe(true);
    }
  });

  it("exposes a hex fallback for every token", () => {
    for (const name of Object.keys(color)) expect(hex[name as ColorToken]).toMatch(/^#[\da-f]{6}$/);
  });

  it("passes WCAG AA (4.5:1) for text colors on every surface", () => {
    const textTokens: ColorToken[] = ["fg-1", "fg-2", "fg-3", "calm", "calm-hi", "warn", "warn-hi", "liq", "liq-hi", "safe", "safe-hi", "monad-hi"];
    for (const fg of textTokens) {
      for (const bg of surfaces) expect(contrastRatio(color[fg], color[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps fg-4 and the Monad fill at 3:1 (large text, non-text marks) on bg, elev-1 and elev-2", () => {
    for (const fg of ["fg-4", "monad"] as const) {
      for (const bg of ["bg", "elev-1", "elev-2"] as const) {
        expect(contrastRatio(color[fg], color[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("gives input borders 3:1 non-text contrast (WCAG 1.4.11)", () => {
    for (const bg of surfaces) expect(contrastRatio(color["line-strong"], color[bg]), bg).toBeGreaterThanOrEqual(3);
  });

  it("keeps dark text readable on filled status chips and the primary button", () => {
    for (const fill of ["fg-1", "calm", "warn", "liq", "safe"] as const) {
      expect(contrastRatio(color.bg, color[fill]), `bg on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("orders the surfaces and the text scale by lightness", () => {
    const l = (t: ColorToken) => parseOklch(color[t]).l;
    const surfaceOrder: ColorToken[] = ["void", "bg", "elev-1", "elev-2", "elev-3"];
    const textOrder: ColorToken[] = ["fg-1", "fg-2", "fg-3", "fg-4"];
    surfaceOrder.slice(1).forEach((t, i) => expect(l(t)).toBeGreaterThan(l(surfaceOrder[i])));
    textOrder.slice(1).forEach((t, i) => expect(l(t)).toBeLessThan(l(textOrder[i])));
  });
});
