/**
 * The poster as geometry: the hero model posed at a progress, projected through the stage camera
 * into SVG paths (painter's order, flat-shaded faces, glowing edges, floor grid and heat pools).
 * Pure and server-safe; coordinates are rounded so server and browser markup match (design rule 9).
 */
import { lerp } from "@/motion/easing";
import { DOMINO, type HeroModel } from "./model";
import { dominoLook, hexToLinear, linearToHex, poolOf, SCENE_COLORS, type DominoLook, type Rgb } from "./palette";
import { cameraBasis, CLIP, FLOOR, fogAt, makeProjector, type Framing, type Projected, type Vec3 } from "./stage";

/** Frame height in SVG units (the width is `aspect` times this). */
export const POSTER_HEIGHT = 1000;
/** Fog levels the face gradients are quantized to. */
export const FOG_LEVELS = 7;

export type PosterFace = { d: string; kind: "broad" | "narrow" | "top"; fog: number };
export type PosterEdge = { d: string; color: string; opacity: number };
export type PosterDomino = {
  index: number;
  faces: PosterFace[];
  /** Hairline edges, grouped by color. */
  edges: PosterEdge[];
  /** Wide, faint underlay of the hairlines for hot dominoes (a glow without filters). */
  glow: PosterEdge | null;
};
export type PosterPool = { cx: number; cy: number; rx: number; ry: number; tone: "warn" | "liq"; opacity: number };
export type PosterFrame = {
  width: number;
  height: number;
  grid: { d: string; opacity: number }[];
  pools: PosterPool[];
  dominoes: PosterDomino[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pt = (p: Projected) => `${r1(p.x)} ${r1(p.y)}`;

/* ------------------------------------------------------------------------------------------------
 * Boxes
 * ---------------------------------------------------------------------------------------------- */

/** Corner index = ix + 2·iy + 4·iz (0 = −, 1 = +) of the box x ∈ ±t/2, y ∈ [0, h], z ∈ ±w/2. */
const FACES = [
  { corners: [0, 2, 6, 4], normal: [-1, 0, 0], kind: "broad" },
  { corners: [1, 3, 7, 5], normal: [1, 0, 0], kind: "broad" },
  { corners: [0, 1, 5, 4], normal: [0, -1, 0], kind: "top" },
  { corners: [2, 3, 7, 6], normal: [0, 1, 0], kind: "top" },
  { corners: [0, 1, 3, 2], normal: [0, 0, -1], kind: "narrow" },
  { corners: [4, 5, 7, 6], normal: [0, 0, 1], kind: "narrow" },
] as const;

/** World corners of a domino at `angle`, tipped about its front-bottom edge. */
export function boxCorners(x: number, height: number, angle: number): Vec3[] {
  const t = DOMINO.thickness;
  const w = DOMINO.width;
  const px = x + t / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: Vec3[] = [];
  for (let k = 0; k < 8; k++) {
    const dx = (k & 1 ? t / 2 : -t / 2) - t / 2;
    const dy = k & 2 ? height : 0;
    const z = k & 4 ? w / 2 : -w / 2;
    out.push([px + dx * c + dy * s, -dx * s + dy * c, z]);
  }
  return out;
}

const rotateNormal = ([nx, ny, nz]: readonly number[], angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [nx * c + ny * s, -nx * s + ny * c, nz];
};

/* ------------------------------------------------------------------------------------------------
 * Floor
 * ---------------------------------------------------------------------------------------------- */

/** Grid line opacity at the camera, before fog and the side fade. */
export const GRID_ALPHA = 0.085;
const GRID_SEGMENT = 1.8;
const GRID_BUCKETS = 6;

function clipToNear(a: Vec3, b: Vec3, depth: (p: Vec3) => number): [Vec3, Vec3] | null {
  const da = depth(a) - CLIP.near;
  const db = depth(b) - CLIP.near;
  if (da <= 0 && db <= 0) return null;
  if (da > 0 && db > 0) return [a, b];
  const t = da / (da - db);
  const cut: Vec3 = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  return da > 0 ? [a, cut] : [cut, b];
}

/** Soft edge of the grid: fades toward the borders of the floor square. */
const sideFade = (x: number, z: number) => {
  const edge = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, Math.min(v - lo, hi - v) / 4));
  return edge(x, FLOOR.minX, FLOOR.maxX) * edge(z, FLOOR.minZ, FLOOR.maxZ);
};

function floorGrid(project: (x: number, y: number, z: number) => Projected, framing: Framing, width: number, height: number) {
  const { forward } = cameraBasis(framing);
  const [ex, ey, ez] = framing.position;
  const depth = (p: Vec3) => (p[0] - ex) * forward[0] + (p[1] - ey) * forward[1] + (p[2] - ez) * forward[2];
  const buckets: string[][] = Array.from({ length: GRID_BUCKETS }, () => []);
  const margin = 40;
  const addLine = (a: Vec3, b: Vec3) => {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const pieces = Math.max(1, Math.ceil(length / GRID_SEGMENT));
    for (let i = 0; i < pieces; i++) {
      const p0: Vec3 = [lerp(a[0], b[0], i / pieces), 0, lerp(a[2], b[2], i / pieces)];
      const p1: Vec3 = [lerp(a[0], b[0], (i + 1) / pieces), 0, lerp(a[2], b[2], (i + 1) / pieces)];
      const clipped = clipToNear(p0, p1, depth);
      if (!clipped) continue;
      const [q0, q1] = clipped;
      const mid: Vec3 = [(q0[0] + q1[0]) / 2, 0, (q0[2] + q1[2]) / 2];
      const opacity = GRID_ALPHA * (1 - fogAt(depth(mid))) * sideFade(mid[0], mid[2]);
      if (opacity < 0.004) continue;
      const s0 = project(...q0);
      const s1 = project(...q1);
      const out = (v: number, max: number) => v < -margin || v > max + margin;
      if ((out(s0.x, width) && out(s1.x, width) && Math.sign(s0.x) === Math.sign(s1.x)) || (s0.y > height + margin && s1.y > height + margin)) continue;
      const bucket = Math.min(GRID_BUCKETS - 1, Math.floor((opacity / GRID_ALPHA) * GRID_BUCKETS));
      buckets[bucket].push(`M${pt(s0)}L${pt(s1)}`);
    }
  };
  for (let z = FLOOR.minZ; z <= FLOOR.maxZ + 1e-9; z += FLOOR.cell) addLine([FLOOR.minX, 0, z], [FLOOR.maxX, 0, z]);
  for (let x = FLOOR.minX; x <= FLOOR.maxX + 1e-9; x += FLOOR.cell) addLine([x, 0, FLOOR.minZ], [x, 0, FLOOR.maxZ]);
  return buckets
    .map((segments, bucket) => ({ d: segments.join(""), opacity: r2(((bucket + 0.5) / GRID_BUCKETS) * GRID_ALPHA) }))
    .filter((line) => line.d.length > 0);
}

/* ------------------------------------------------------------------------------------------------
 * Frame
 * ---------------------------------------------------------------------------------------------- */

const lookColor = (rgb: Rgb) => linearToHex(rgb);
/** Stroke opacity of the hairline for an edge intensity. */
const edgeOpacity = (intensity: number) => Math.min(1, 0.1 + intensity * 0.62);

/**
 * Projects the posed model into a frame. `angles` from `poseAt`, `progress` for the looks.
 */
export function posterFrame(model: HeroModel, angles: ArrayLike<number>, progress: number, framing: Framing): PosterFrame {
  const height = POSTER_HEIGHT;
  const width = r1(POSTER_HEIGHT * framing.aspect);
  const project = makeProjector(framing, POSTER_HEIGHT);
  const eye = framing.position;
  const { forward } = cameraBasis(framing);
  const depthOf = (p: Vec3) => (p[0] - eye[0]) * forward[0] + (p[1] - eye[1]) * forward[1] + (p[2] - eye[2]) * forward[2];

  const items = model.dominoes.map((d, i) => {
    const angle = angles[i] ?? 0;
    const corners = boxCorners(d.x, d.height, angle);
    const center: Vec3 = [
      corners.reduce((sum, c) => sum + c[0], 0) / 8,
      corners.reduce((sum, c) => sum + c[1], 0) / 8,
      0,
    ];
    return { d, angle, corners, depth: depthOf(center), center, look: dominoLook(d, progress) };
  });

  const pools: PosterPool[] = [];
  const dominoes: PosterDomino[] = [];
  // Far to near: nearer dominoes paint over the ones behind them.
  for (const item of [...items].sort((a, b) => b.depth - a.depth || b.d.index - a.d.index)) {
    if (item.depth <= CLIP.near) continue;
    const { d, angle, corners, look } = item;
    const screen = corners.map((c) => project(...c));
    const fog = fogAt(item.depth);
    const faces: PosterFace[] = [];
    const edgeKeys = new Set<string>();
    for (const face of FACES) {
      const n = rotateNormal(face.normal, angle);
      const [a, b, c, e] = face.corners.map((k) => corners[k]);
      const mid: Vec3 = [(a[0] + b[0] + c[0] + e[0]) / 4, (a[1] + b[1] + c[1] + e[1]) / 4, (a[2] + b[2] + c[2] + e[2]) / 4];
      const toEye: Vec3 = [eye[0] - mid[0], eye[1] - mid[1], eye[2] - mid[2]];
      if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] <= 0) continue;
      faces.push({ d: `M${face.corners.map((k) => pt(screen[k])).join("L")}Z`, kind: face.kind, fog: r2(fog) });
      for (let j = 0; j < 4; j++) {
        const p = face.corners[j];
        const q = face.corners[(j + 1) % 4];
        edgeKeys.add(p < q ? `${p}-${q}` : `${q}-${p}`);
      }
    }
    const visibility = 1 - fog;
    const topHex = lookColor(look.top);
    const lowHex = lookColor(look.low);
    const topPath: string[] = [];
    const lowPath: string[] = [];
    for (const key of [...edgeKeys].sort()) {
      const [p, q] = key.split("-").map(Number);
      // Edges along the foot take the low color (a stuck position hit by a liquidation keeps a red foot).
      const foot = (p & 2) === 0 && (q & 2) === 0;
      (foot && lowHex !== topHex ? lowPath : topPath).push(`M${pt(screen[p])}L${pt(screen[q])}`);
    }
    const opacity = r2(edgeOpacity(look.intensity) * visibility);
    const edges: PosterEdge[] = [{ d: topPath.join(""), color: topHex, opacity }];
    if (lowPath.length) edges.push({ d: lowPath.join(""), color: lowHex, opacity });
    const glow =
      look.intensity > 0.6
        ? { d: [...topPath, ...lowPath].join(""), color: lookColor(mixLook(look)), opacity: r2(Math.min(0.5, (look.intensity - 0.6) * 0.22) * visibility) }
        : null;
    dominoes.push({ index: d.index, faces, edges: edges.filter((e) => e.d), glow });

    const pool = poolOf(look);
    if (pool) {
      const cx = item.center[0];
      const c = project(cx, 0, pool.z);
      const left = project(cx - pool.radiusX, 0, pool.z);
      const right = project(cx + pool.radiusX, 0, pool.z);
      const front = project(cx, 0, pool.z + pool.radiusZ);
      const back = project(cx, 0, pool.z - pool.radiusZ);
      pools.push({
        cx: r1(c.x),
        cy: r1(c.y),
        rx: r1(Math.max(4, Math.abs(right.x - left.x) / 2)),
        ry: r1(Math.max(2, Math.abs(front.y - back.y) / 2)),
        tone: look.top[1] > look.top[0] * 0.3 ? "warn" : "liq",
        opacity: r2(Math.min(0.5, 0.32 * pool.heat) * visibility),
      });
    }
  }

  return { width, height, grid: floorGrid(project, framing, width, height), pools, dominoes };
}

const mixLook = (look: DominoLook): Rgb => [(look.top[0] + look.low[0]) / 2, (look.top[1] + look.low[1]) / 2, (look.top[2] + look.low[2]) / 2];

/* ------------------------------------------------------------------------------------------------
 * Face shading (sRGB), shared by the poster's gradients
 * ---------------------------------------------------------------------------------------------- */

/** Base colors of the monolith faces, top of the gradient → foot (sRGB hex). */
export const FACE_SHADES = {
  broad: ["#1c1a29", "#0b0a13"],
  narrow: ["#15141f", "#08080f"],
  top: ["#2a2640", "#1a1828"],
} as const;

/** A face shade faded toward the stage color by `fog` (0–1). */
export function fogged(color: string, fog: number): string {
  const a = hexToLinear(color);
  const v = SCENE_COLORS.void;
  return linearToHex([lerp(a[0], v[0], fog), lerp(a[1], v[1], fog), lerp(a[2], v[2], fog)]);
}

/** Quantized fog level of a face, for the shared gradients (0 … FOG_LEVELS − 1). */
export const fogLevel = (fog: number) => Math.min(FOG_LEVELS - 1, Math.max(0, Math.round(fog * (FOG_LEVELS - 1))));
