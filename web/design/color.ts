/**
 * OKLCH helpers for the design system.
 *
 * CSS is the source of truth for colors (`design/tokens.css`), but some consumers cannot read
 * `oklch()` strings: three.js materials, canvas 2D in older engines, and our own contrast tests.
 * These pure functions convert OKLCH to sRGB with the reference OKLab matrices (Björn Ottosson)
 * and compute WCAG 2.x contrast ratios.
 */

export type Oklch = { l: number; c: number; h: number; alpha?: number };
export type Rgb = { r: number; g: number; b: number };

/** Parses `oklch(L C H)` / `oklch(L C H / A)`. L accepts 0..1 or a percentage, A accepts 0..1 or a percentage. */
export function parseOklch(input: string): Oklch {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i.exec(input.trim());
  if (!match) throw new Error(`Not an oklch() color: ${input}`);
  const [, l, c, h, a] = match;
  const unit = (v: string) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v));
  return { l: unit(l), c: parseFloat(c), h: parseFloat(h), alpha: a === undefined ? 1 : unit(a) };
}

export function formatOklch({ l, c, h, alpha = 1 }: Oklch): string {
  const round = (v: number, d: number) => Number(v.toFixed(d));
  const base = `${round(l, 3)} ${round(c, 3)} ${round(h, 1)}`;
  return alpha < 1 ? `oklch(${base} / ${round(alpha, 3)})` : `oklch(${base})`;
}

/** OKLCH -> linear-light sRGB (may fall outside 0..1 when the color is out of gamut). */
export function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return {
    r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  };
}

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** True when the color is displayable in sRGB without clipping (small tolerance for float noise). */
export function inSrgbGamut(color: Oklch, epsilon = 1e-4): boolean {
  const { r, g, b } = oklchToLinearSrgb(color);
  return [r, g, b].every((v) => v >= -epsilon && v <= 1 + epsilon);
}

/** Gamma-encoded sRGB channels in 0..1, clipped to gamut. */
export function oklchToSrgb(color: Oklch): Rgb {
  const { r, g, b } = oklchToLinearSrgb(color);
  return { r: clamp01(encode(r)), g: clamp01(encode(g)), b: clamp01(encode(b)) };
}

export function srgbToHex({ r, g, b }: Rgb): string {
  const byte = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function hexToSrgb(hex: string): Rgb {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a #rrggbb color: ${hex}`);
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

/** sRGB (gamma-encoded, 0..1) -> OKLCH. */
export function srgbToOklch({ r, g, b }: Rgb): Oklch {
  const R = decode(r);
  const G = decode(g);
  const B = decode(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, Bb);
  const h = c < 1e-7 ? 0 : ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

export function oklchToHex(color: Oklch | string): string {
  return srgbToHex(oklchToSrgb(typeof color === "string" ? parseOklch(color) : color));
}

/** Alpha-composites `top` over an opaque `bottom` in gamma-encoded sRGB, the way browsers paint. */
export function composite(top: Oklch, bottom: Oklch): Rgb {
  const a = top.alpha ?? 1;
  const t = oklchToSrgb(top);
  const u = oklchToSrgb(bottom);
  return { r: t.r * a + u.r * (1 - a), g: t.g * a + u.g * (1 - a), b: t.b * a + u.b * (1 - a) };
}

/** WCAG 2.x relative luminance of a gamma-encoded sRGB color. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

/** WCAG 2.x contrast ratio (1..21). A translucent foreground is composited over the background first. */
export function contrastRatio(fg: Oklch | string, bg: Oklch | string): number {
  const f = typeof fg === "string" ? parseOklch(fg) : fg;
  const b = typeof bg === "string" ? parseOklch(bg) : bg;
  const l1 = relativeLuminance(composite(f, b));
  const l2 = relativeLuminance(oklchToSrgb(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
