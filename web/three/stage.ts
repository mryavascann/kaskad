/**
 * Camera, framing, fog and backdrop shared by the WebGL scene and the SVG poster. Both project the
 * same model through the same camera, so the poster is a faithful still of the scene and the canvas
 * can cross-fade over it without a jump. Server-safe (plain math, no three.js).
 */

export type Vec3 = readonly [number, number, number];

/**
 * A camera and the frame it is composed for. The frame covers its container like
 * `object-fit: cover`: a container with another aspect crops the frame, keeping the part given by
 * `alignX` / `alignY` (0 = left/top edge, 1 = right/bottom edge). The poster does the same crop in CSS.
 */
export type Framing = {
  name: "wide" | "tall";
  /** Frame aspect, width / height. */
  aspect: number;
  /** Vertical field of view, degrees. */
  fov: number;
  position: Vec3;
  target: Vec3;
  alignX: number;
  alignY: number;
};

/**
 * Low 3/4 view along the row through a long lens: the row starts on the left and recedes to the right
 * into the dark, with mild perspective so heights (debt) stay comparable along the row. The row sits
 * in the lower half of the frame; the upper half stays quiet for the headline.
 */
export const FRAMINGS = {
  wide: { name: "wide", aspect: 16 / 9, fov: 17, position: [-11, 1.1, 7.2], target: [8.5, 1.25, -1.2], alignX: 0.5, alignY: 0.5 },
  tall: { name: "tall", aspect: 9 / 16, fov: 30, position: [-11, 2.1, 3.2], target: [10, 1.1, -1], alignX: 0.3, alignY: 0.5 },
} as const satisfies Record<string, Framing>;

/** Containers narrower than this aspect (portrait phones) use the tall framing. */
export const TALL_BELOW = 1;

export const framingFor = (width: number, height: number): Framing =>
  height > 0 && width / height < TALL_BELOW ? FRAMINGS.tall : FRAMINGS.wide;

/** The frame, scaled to cover a `width` × `height` container, and where the container sits in it (px). */
export function frameCrop(width: number, height: number, framing: Framing) {
  const frameHeight = Math.max(height, width / framing.aspect);
  const frameWidth = frameHeight * framing.aspect;
  return {
    frameWidth,
    frameHeight,
    offsetX: (frameWidth - width) * framing.alignX,
    offsetY: (frameHeight - height) * framing.alignY,
  };
}

/** Near and far clip planes (world units). */
export const CLIP = { near: 0.1, far: 80 } as const;

/** Linear fog toward the stage color, by distance along the view direction. */
export const FOG = { near: 13, far: 42 } as const;

export const fogAt = (depth: number) => {
  const x = Math.min(1, Math.max(0, (depth - FOG.near) / (FOG.far - FOG.near)));
  return x * x * (3 - 2 * x);
};

/** Floor grid: cell size and the square it covers around the row (world units). */
export const FLOOR = { cell: 0.9, minX: -9, maxX: 36, minZ: -14, maxZ: 7 } as const;

/**
 * Backdrop gradients in frame coordinates (0–1, y down), composited in sRGB over `void` like a
 * CSS `radial-gradient(ellipse rx ry at cx cy, color / alpha, transparent stop)`.
 */
export const BACKDROP = {
  haze: { cx: 0.5, cy: -0.08, rx: 0.78, ry: 0.95, alpha: 0.2, stop: 0.72 },
  glow: { cx: 0.46, cy: 1.02, rx: 0.66, ry: 0.4, alpha: 0.12, stop: 0.82 },
} as const;

type Mat3 = { right: Vec3; up: Vec3; forward: Vec3 };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Camera basis for `lookAt(target)` with +y up (what three.js' `Object3D.lookAt` builds). */
export function cameraBasis(framing: Framing): Mat3 {
  const forward = normalize(sub(framing.target, framing.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  return { right, up: cross(right, forward), forward };
}

export type Projected = { x: number; y: number; depth: number };

/**
 * Perspective projection into frame units (`frameHeight` tall, `frameHeight × aspect` wide, y down):
 * the same projection three.js' PerspectiveCamera applies. `depth` is the distance along the view
 * direction (≤ 0: behind the camera).
 */
export function makeProjector(framing: Framing, frameHeight = 1000) {
  const { right, up, forward } = cameraBasis(framing);
  const focal = 1 / Math.tan((framing.fov * Math.PI) / 360);
  const width = frameHeight * framing.aspect;
  const [ex, ey, ez] = framing.position;
  return (x: number, y: number, z: number): Projected => {
    const d: Vec3 = [x - ex, y - ey, z - ez];
    const cx = dot(d, right);
    const cy = dot(d, up);
    const depth = dot(d, forward);
    const ndcX = ((focal / framing.aspect) * cx) / depth;
    const ndcY = (focal * cy) / depth;
    return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * frameHeight, depth };
  };
}
