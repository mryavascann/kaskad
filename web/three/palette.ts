/**
 * Domino state → edge color and glow, from the design tokens (`hex`: three.js cannot parse oklch).
 * The only colors that carry meaning: amber (`warn`) = stuck, can't be liquidated instantly; red
 * (`liq`) = liquidated or bad debt; a cool hairline (`fg-3`) = upright. Shared by the WebGL scene
 * (linear RGB × intensity) and the SVG poster (sRGB hex + opacity). Server-safe.
 */
import { hex, type ColorToken } from "@/design/tokens";
import { clamp, ease, lerp } from "@/motion/easing";
import { duration, toSeconds } from "@/motion/tokens";
import { fallAt, TIMING, warmthAt, type HeroDomino } from "./model";

export type Rgb = readonly [number, number, number];

/** sRGB hex → linear RGB (0–1), the space three.js lights and blends in. */
export function hexToLinear(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
}

/** Linear RGB → sRGB hex (clamped). */
export function linearToHex([r, g, b]: Rgb): string {
  const channel = (c: number) => {
    const v = clamp(c);
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const token = (name: ColorToken) => hexToLinear(hex[name]);
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Scene colors (linear RGB). */
export const SCENE_COLORS = {
  void: token("void"),
  bg: token("bg"),
  elev1: token("elev-1"),
  elev2: token("elev-2"),
  hairline: token("fg-3"),
  warn: token("warn"),
  liq: token("liq"),
  monad: token("monad"),
} as const;

/**
 * Edge intensities (1 = the token color at full strength; the WebGL bloom picks up what is above ~1).
 * Ordered by alarm: upright < warming < stuck < liquidated < bad debt < a liquidation hitting.
 */
export const EDGE = {
  upright: 0.08,
  warm: 0.42,
  stuck: 0.95,
  liquidated: 2,
  badDebt: 2.6,
  hit: 4,
  /** Extra glow at the moment a domino lands, fading over `duration.slow`. */
  landing: 0.8,
} as const;

/** Faint red tint of the faces of a bad-debt domino (collateral worth less than the debt). */
export const BAD_DEBT_FACE = 0.1;

export type DominoLook = {
  /** Edge color at the top of the domino (linear RGB, not yet scaled by intensity). */
  top: Rgb;
  /** Edge color at the foot: red on a stuck position that was partly liquidated. */
  low: Rgb;
  intensity: number;
  /** Emissive tint of the faces, 0–1 (bad debt only). */
  face: number;
};

const LANDING_GLOW_S = toSeconds(duration.slow);
const HIT_GLOW_S = toSeconds(duration.scene);

const outcomeLook = (kind: HeroDomino["kind"], partial: boolean): { top: Rgb; low: Rgb; intensity: number; face: number } => {
  switch (kind) {
    case "bad-debt":
      return { top: SCENE_COLORS.liq, low: SCENE_COLORS.liq, intensity: EDGE.badDebt, face: BAD_DEBT_FACE };
    case "liquidated":
      return { top: SCENE_COLORS.liq, low: SCENE_COLORS.liq, intensity: EDGE.liquidated, face: 0 };
    case "stuck":
      return { top: SCENE_COLORS.warn, low: partial ? SCENE_COLORS.liq : SCENE_COLORS.warn, intensity: EDGE.stuck, face: 0 };
    default:
      return { top: SCENE_COLORS.hairline, low: SCENE_COLORS.hairline, intensity: EDGE.upright, face: 0 };
  }
};

/**
 * What a domino looks like at `progress`. Upright dominoes keep a cool hairline that warms toward
 * amber as the price closes in on their liquidation price; a tipping domino takes its outcome color
 * as it falls, flashes on landing, and flashes red when a liquidation hits it. Outcomes never show
 * before the domino tips.
 */
export function dominoLook(d: HeroDomino, progress: number): DominoLook {
  const warmth = warmthAt(d, progress);
  const standing: DominoLook = {
    top: mix(SCENE_COLORS.hairline, SCENE_COLORS.warn, warmth),
    low: mix(SCENE_COLORS.hairline, SCENE_COLORS.warn, warmth),
    intensity: lerp(EDGE.upright, EDGE.warm, warmth),
    face: 0,
  };
  if (d.tipAt === null || progress < d.tipAt) return standing;

  const hit = d.hitAt !== null && progress >= d.hitAt;
  const target = outcomeLook(d.kind, hit);
  const fall = fallAt(d, progress);
  // The outcome color arrives with the fall (color follows the causality: tipped → stuck/liquidated).
  const look: DominoLook = {
    top: mix(standing.top, target.top, fall),
    low: mix(standing.low, target.low, fall),
    intensity: lerp(standing.intensity, target.intensity, ease.outQuart(fall)),
    face: target.face * fall,
  };
  if (d.landAt !== null && progress > d.landAt) {
    const t = ((progress - d.landAt) * TIMING.seconds) / LANDING_GLOW_S;
    look.intensity += EDGE.landing * (1 - ease.outQuart(clamp(t)));
  }
  if (d.hitAt !== null && progress >= d.hitAt) {
    const t = clamp(((progress - d.hitAt) * TIMING.seconds) / HIT_GLOW_S);
    const flash = 1 - ease.outExpo(t);
    look.top = mix(look.top, SCENE_COLORS.liq, flash);
    look.low = mix(look.low, SCENE_COLORS.liq, flash);
    look.intensity = lerp(look.intensity, EDGE.hit, flash);
  }
  return look;
}

/** How hot a domino is for the floor glow under it: 0 upright and cold, ~1 at full alarm. */
export function heatOf(look: DominoLook): number {
  return clamp((look.intensity - EDGE.upright) / (EDGE.badDebt - EDGE.upright), 0, 1.6);
}

export type Pool = { heat: number; radiusX: number; radiusZ: number; z: number };

/**
 * The light a hot domino spills on the floor: an ellipse around the domino, stretched toward the
 * camera (+z) so it shows in front of the row. Shared by the scene and the poster. Null when cold.
 */
export function poolOf(look: DominoLook): Pool | null {
  const heat = heatOf(look);
  if (heat <= 0.05) return null;
  const h = Math.min(1, heat);
  return { heat, radiusX: 0.5 + 0.3 * h, radiusZ: 1 + 0.6 * h, z: 0.25 };
}
