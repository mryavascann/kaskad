/**
 * The hero's domino row as plain numbers: layout, heights, tip schedule and the pose of every domino
 * as a pure function of the timeline progress. The WebGL scene and the SVG poster both draw from it,
 * so a frame is identical for the same progress (demo mode, replays, poster ↔ canvas cross-fade).
 * Server-safe: no three.js, no DOM.
 *
 * Coordinates: world units where the tallest domino is 1 high. The row runs along +x from x = 0,
 * dominoes stand on the floor (y = 0) and tip toward +x about their front-bottom edge.
 */
import type { PositionOutcome } from "@/lib/chain/book";
import { clamp, ease, lerp } from "@/motion/easing";
import { springPeakTime, springStep } from "@/motion/spring";
import { spring } from "@/motion/tokens";

/** One borrower as the hero draws it. Plain data: it crosses the server → client boundary. */
export type HeroPosition = {
  /** Rank by distance to liquidation: 0 = closest, stands first in the row and tips first. */
  order: number;
  /** Debt at the start of the run (USD), drawn as height on a compressed (log) scale. */
  debtUsd: number;
  /** End state of the run (`classifyPositions`). Safe positions never move. */
  outcome: PositionOutcome;
  /**
   * Timeline progress (0–1) at which the domino starts to tip: the block in which the price crossed
   * its liquidation threshold. Ignored for safe positions; derived from `order` when absent.
   */
  tipAt?: number;
  /** Timeline progress of its first liquidation (a red flash). Absent: never liquidated. */
  hitAt?: number;
  /**
   * Timeline progress at which the price reaches its liquidation price; above 1 when that happens
   * only after this run, null when never. Warms the edge amber as the price closes in.
   */
  thresholdAt?: number | null;
};

/**
 * Domino dimensions (world units). Chunky monoliths with narrow gaps: a chain of fallen slabs rests
 * at acos(thickness / spacing) ≈ 46°, so a fallen row still reads as a row, not a flat pile.
 */
export const DOMINO = {
  /** Along the row (x). */
  thickness: 0.28,
  /** Across the row (z): the broad face. */
  width: 0.55,
  /** Clear gap between neighbours. Decides how far a tipped domino leans on the next one. */
  gap: 0.12,
  minHeight: 0.45,
  maxHeight: 1,
  /** Loading state: one height for all, nothing encoded. */
  neutralHeight: 0.72,
  /** Bevel radius of the monoliths (WebGL geometry). */
  bevel: 0.016,
} as const;

export const SPACING = DOMINO.thickness + DOMINO.gap;

/**
 * A stuck position tips but cannot fall: no liquidator can clear it. Its domino freezes at this
 * lean (or earlier, on the next domino). Below the chain angle, so frozen neighbours never touch.
 */
export const STUCK_LEAN = (24 * Math.PI) / 180;

/** Timeline constants, in progress units (0–1) unless stated otherwise. */
export const TIMING = {
  /** Time a domino takes to fall from upright to its resting angle (ease.inQuart). */
  fall: 0.055,
  /** Time after landing reserved for the impact spring to settle. */
  settle: 0.06,
  /** How far the landing throws a domino back, as a share of its angle (impact spring). */
  rebound: 0.1,
  /** Nominal length of the whole timeline in seconds: turns progress into spring time. */
  seconds: 6,
  /** Amber pre-glow: the progress window before a position's threshold in which its edge warms up. */
  warmWindow: 0.14,
} as const;

/** Dominoes drawn while there is no data yet (the landing passes the real book size). */
export const DEFAULT_PLACEHOLDER_COUNT = 48;

const HALF_PI = Math.PI / 2;
/** Dynamic range of the height scale: debts this many decades below the largest keep a visible step. */
const HEIGHT_DECADES = 4;
const CONTACT_ITERATIONS = 28;

export type DominoKind = "neutral" | PositionOutcome;

export type HeroDomino = {
  index: number;
  /** Center of the base along the row. */
  x: number;
  height: number;
  kind: DominoKind;
  debtUsd: number | null;
  /** Progress at which it starts to tip; null: never moves. */
  tipAt: number | null;
  /** Progress of its first liquidation; null: never liquidated. */
  hitAt: number | null;
  thresholdAt: number | null;
  /** Final angle in radians: 0 upright, π/2 flat on the floor. */
  rest: number;
  /** Progress of the first contact with the next domino (start of the landing spring). */
  landAt: number | null;
};

export type HeroModel = {
  dominoes: HeroDomino[];
  /** True without data: every domino neutral and upright. */
  neutral: boolean;
  /** x of the last base center (the first is at 0). */
  length: number;
};

/**
 * Height for a debt: log-compressed so the largest borrower does not dwarf the rest. 1 at the
 * largest debt, `minHeight` at zero debt; each decade below the largest takes an equal step.
 */
export function heightFor(debtUsd: number, maxDebtUsd: number): number {
  if (!(maxDebtUsd > 0) || !(debtUsd > 0)) return DOMINO.minHeight;
  const unit = maxDebtUsd / 10 ** HEIGHT_DECADES;
  const share = Math.log10(1 + debtUsd / unit) / Math.log10(1 + maxDebtUsd / unit);
  return lerp(DOMINO.minHeight, DOMINO.maxHeight, clamp(share));
}

/** Last progress at which a domino may start tipping and still settle by the end of the timeline. */
export const LAST_TIP = 1 - TIMING.fall - TIMING.settle;

/* ------------------------------------------------------------------------------------------------
 * 2D contact geometry (the row's x-y plane)
 * ---------------------------------------------------------------------------------------------- */

type Quad = Float64Array; // [x0, y0, x1, y1, x2, y2, x3, y3]

/**
 * Corners of a domino tipped by `angle` (clockwise, toward +x) about its front-bottom edge, in the
 * order back-bottom, front-bottom (the pivot), front-top, back-top.
 */
export function dominoCorners(x: number, height: number, angle: number, out: Quad = new Float64Array(8)): Quad {
  const t = DOMINO.thickness;
  const px = x + t / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = px - t * c;
  out[1] = t * s;
  out[2] = px;
  out[3] = 0;
  out[4] = px + height * s;
  out[5] = height * c;
  out[6] = px - t * c + height * s;
  out[7] = t * s + height * c;
  return out;
}

/** True when the projections of `a` and `b` on the two edge normals of `axes` are apart. */
function separated(axes: Quad, a: Quad, b: Quad): boolean {
  for (let e = 0; e < 2; e++) {
    const nx = axes[2 * e + 1] - axes[2 * e + 3];
    const ny = axes[2 * e + 2] - axes[2 * e];
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (let k = 0; k < 4; k++) {
      const pa = a[2 * k] * nx + a[2 * k + 1] * ny;
      const pb = b[2 * k] * nx + b[2 * k + 1] * ny;
      if (pa < minA) minA = pa;
      if (pa > maxA) maxA = pa;
      if (pb < minB) minB = pb;
      if (pb > maxB) maxB = pb;
    }
    if (maxA < minB || maxB < minA) return true;
  }
  return false;
}

/** Separating-axis test for two rectangles. */
export function quadsOverlap(a: Quad, b: Quad): boolean {
  return !separated(a, a, b) && !separated(b, a, b);
}

const scratchSelf = new Float64Array(8);
const scratchA = new Float64Array(8);
const scratchB = new Float64Array(8);

/**
 * Largest angle domino `i` can tip to before it touches the next two dominoes in their current
 * `angles` (π/2 when nothing is in the way: it lies flat on the floor). Bisection on the angle: the
 * overlap only grows once the rotating slab meets an obstacle ahead of it.
 */
export function contactAngle(dominoes: readonly HeroDomino[], angles: ArrayLike<number>, i: number): number {
  const self = dominoes[i];
  const obstacles: Quad[] = [];
  const next = dominoes[i + 1];
  const after = dominoes[i + 2];
  if (next) obstacles.push(dominoCorners(next.x, next.height, angles[i + 1], scratchA));
  if (after) obstacles.push(dominoCorners(after.x, after.height, angles[i + 2], scratchB));
  if (!obstacles.length) return HALF_PI;
  const hits = (angle: number) => {
    const quad = dominoCorners(self.x, self.height, angle, scratchSelf);
    for (const obstacle of obstacles) if (quadsOverlap(quad, obstacle)) return true;
    return false;
  };
  if (!hits(HALF_PI)) return HALF_PI;
  if (hits(0)) return 0;
  let lo = 0;
  let hi = HALF_PI;
  for (let k = 0; k < CONTACT_ITERATIONS; k++) {
    const mid = (lo + hi) / 2;
    if (hits(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/* ------------------------------------------------------------------------------------------------
 * Landing spring
 * ---------------------------------------------------------------------------------------------- */

const IMPULSE_STEP = 1e-4;
/** Velocity of the impact spring's step response (its impulse response), by central difference. */
const impulse = (seconds: number) =>
  (springStep(spring.impact, seconds + IMPULSE_STEP) - springStep(spring.impact, Math.max(0, seconds - IMPULSE_STEP))) /
  (seconds + IMPULSE_STEP - Math.max(0, seconds - IMPULSE_STEP));

/** Peak of the impulse response: where the step response is steepest (before its overshoot peak). */
const IMPULSE_PEAK = (() => {
  const end = springPeakTime(spring.impact);
  let best = 0;
  for (let t = 0; t <= end; t += end / 200) best = Math.max(best, impulse(t));
  return best;
})();

/**
 * The bounce after a domino lands: 0 at the moment of contact, one quick lobe (normalized to 1) as
 * the `impact` spring throws it back, then the smaller lobes of the same spring. Never negative,
 * so a bouncing domino only moves away from what it landed on.
 */
export function landingBounce(seconds: number): number {
  if (seconds <= 0) return 0;
  return Math.max(0, impulse(seconds) / IMPULSE_PEAK);
}

/** Inverse of `ease.inQuart` on [0, 1] (bisection; the curve is monotonic). */
function inQuartInverse(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (ease.inQuart(mid) < value) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------------------------------------
 * Model
 * ---------------------------------------------------------------------------------------------- */

function neutralModel(count: number): HeroModel {
  const n = Math.max(1, Math.round(count));
  const dominoes: HeroDomino[] = Array.from({ length: n }, (_, index) => ({
    index,
    x: index * SPACING,
    height: DOMINO.neutralHeight,
    kind: "neutral",
    debtUsd: null,
    tipAt: null,
    hitAt: null,
    thresholdAt: null,
    rest: 0,
    landAt: null,
  }));
  return { dominoes, neutral: true, length: (n - 1) * SPACING };
}

const finiteOr = (value: number | null | undefined, fallback: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Lays out the row. Without positions: `placeholderCount` neutral dominoes, upright. With positions:
 * one domino per position in `order`, height from debt, and the resting angle of every domino that
 * tips, solved back to front so each one leans on the next in its final pose.
 */
export function buildHeroModel(
  positions: readonly HeroPosition[] | null | undefined,
  { placeholderCount = DEFAULT_PLACEHOLDER_COUNT }: { placeholderCount?: number } = {},
): HeroModel {
  if (!positions?.length) return neutralModel(placeholderCount);

  const sorted = positions
    .map((position, input) => ({ position, input }))
    .sort((a, b) => a.position.order - b.position.order || a.input - b.input)
    .map(({ position }) => position);
  const maxDebt = sorted.reduce((max, p) => Math.max(max, finiteOr(p.debtUsd, 0) ?? 0), 0);
  const tipping = sorted.filter((p) => p.outcome !== "safe");

  const dominoes: HeroDomino[] = sorted.map((p, index) => {
    const moves = p.outcome !== "safe";
    const rank = moves ? tipping.indexOf(p) : -1;
    // No schedule from the caller: tip in row order across the timeline.
    const derived = tipping.length > 1 ? (rank / (tipping.length - 1)) * LAST_TIP : 0;
    const tipAt = moves ? clamp(finiteOr(p.tipAt, derived) ?? derived, 0, LAST_TIP) : null;
    const hitAt = moves ? finiteOr(p.hitAt, null) : null;
    return {
      index,
      x: index * SPACING,
      height: heightFor(finiteOr(p.debtUsd, 0) ?? 0, maxDebt),
      kind: p.outcome,
      debtUsd: finiteOr(p.debtUsd, null),
      tipAt,
      hitAt: hitAt === null ? null : clamp(hitAt),
      thresholdAt: finiteOr(p.thresholdAt, null),
      rest: 0,
      landAt: null,
    };
  });

  // Final poses, back to front: a falling domino (liquidated, bad debt) goes down until it rests on
  // the next ones in their final poses; a stuck one freezes at STUCK_LEAN unless it meets them first.
  const rest = new Float64Array(dominoes.length);
  for (let i = dominoes.length - 1; i >= 0; i--) {
    const d = dominoes[i];
    if (d.tipAt === null) rest[i] = 0;
    else {
      const contact = contactAngle(dominoes, rest, i);
      rest[i] = d.kind === "stuck" ? Math.min(STUCK_LEAN, contact) : contact;
    }
    d.rest = rest[i];
  }

  // First contact: against the next domino if it is still upright when this one lands, else at the
  // end of the fall (both are moving; the difference only shifts the start of the bounce).
  const upright = new Float64Array(dominoes.length);
  for (let i = 0; i < dominoes.length; i++) {
    const d = dominoes[i];
    if (d.tipAt === null) continue;
    const next = dominoes[i + 1];
    const nextStill = !next || next.tipAt === null || next.tipAt >= d.tipAt + TIMING.fall;
    let share = 1;
    if (nextStill && next && d.rest > 0) {
      upright.fill(0);
      share = inQuartInverse(Math.min(1, contactAngle(dominoes, upright, i) / d.rest));
    }
    d.landAt = d.tipAt + TIMING.fall * share;
  }

  return { dominoes, neutral: false, length: (dominoes.length - 1) * SPACING };
}

/**
 * Angles of every domino at `progress`, back to front. A tipping domino falls with `ease.inQuart`
 * toward its resting angle, stops where it meets the next domino in that domino's current pose, and
 * bounces back once with the `impact` spring when it lands. Upright and safe dominoes stay at 0.
 * Pure: the same model and progress always give the same angles.
 */
export function poseAt(model: HeroModel, progress: number, out?: Float64Array): Float64Array {
  const ds = model.dominoes;
  const angles = out && out.length === ds.length ? out : new Float64Array(ds.length);
  const p = clamp(progress);
  for (let i = ds.length - 1; i >= 0; i--) {
    const d = ds[i];
    if (d.tipAt === null || p <= d.tipAt) {
      angles[i] = 0;
      continue;
    }
    const fall = Math.min(1, (p - d.tipAt) / TIMING.fall);
    let angle = Math.min(d.rest * ease.inQuart(fall), contactAngle(ds, angles, i));
    if (d.landAt !== null && p > d.landAt) angle *= 1 - TIMING.rebound * landingBounce((p - d.landAt) * TIMING.seconds);
    angles[i] = angle;
  }
  return angles;
}

/**
 * How far the price has come toward a domino's liquidation price, 0–1, for the amber pre-glow of
 * upright dominoes: 0 until `warmWindow` before its threshold, 1 at the threshold.
 */
export function warmthAt(domino: HeroDomino, progress: number): number {
  if (domino.thresholdAt === null) return 0;
  const start = domino.thresholdAt - TIMING.warmWindow;
  const x = clamp((progress - start) / TIMING.warmWindow);
  return x * x * (3 - 2 * x);
}

/**
 * Where a domino is in its fall at `progress`: 0 upright (or never tips), 1 landed. Drives the edge
 * glow, which heats up as the domino goes over.
 */
export function fallAt(domino: HeroDomino, progress: number): number {
  if (domino.tipAt === null) return 0;
  return clamp((progress - domino.tipAt) / TIMING.fall);
}
