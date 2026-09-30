/**
 * Materials of the hero scene. Client only (three.js). Every color comes from `palette.ts` / the
 * design tokens; every shape constant from `model.ts` / `stage.ts`, shared with the poster.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  NormalBlending,
  ShaderMaterial,
  type IUniform,
} from "three";
import { hex } from "@/design/tokens";
import { DOMINO } from "../model";
import { hexToLinear } from "../palette";
import { FACE_SHADES, GRID_ALPHA } from "../poster-geometry";
import { BACKDROP, FLOOR, FOG } from "../stage";

/** Height of the shared domino geometry; each instance stretches its upper half to its own height. */
export const REF_HEIGHT = 1;

const srgb = (value: string) => {
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

/* ------------------------------------------------------------------------------------------------
 * Dominoes: dark PBR slabs with emissive edges driven by per-instance attributes
 * ---------------------------------------------------------------------------------------------- */

export type DominoUniforms = {
  uRefHeight: IUniform<number>;
  uDims: IUniform<[number, number, number]>;
  uEdgeWidth: IUniform<number>;
  /** vec3[2], flattened: foot, top. */
  uFaceBroad: IUniform<number[]>;
  uFaceNarrow: IUniform<number[]>;
  uFaceTop: IUniform<readonly number[]>;
};

/**
 * MeshStandardMaterial with four instanced attributes: `aHeight` (stretches the top half of the
 * rounded box, so bevels keep their radius), `aEdgeTop` / `aEdgeLow` (edge emission, linear RGB ×
 * intensity, blended from the foot to the top) and `aFace` (faint emissive tint of the faces).
 * The edge mask is the distance to the nearest box edge, anti-aliased with `fwidth`.
 */
export function createDominoMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: new Color("#07060c"),
    metalness: 0.4,
    roughness: 0.45,
    envMapIntensity: 0.8,
  });
  // The faces carry the same shades as the poster (top of the slab → foot), as emission, so the
  // monoliths read as solid shapes whatever the lights do; the PBR part adds the sheen.
  const uniforms: DominoUniforms = {
    uRefHeight: { value: REF_HEIGHT },
    uDims: { value: [DOMINO.thickness, REF_HEIGHT, DOMINO.width] },
    uEdgeWidth: { value: 0.006 },
    uFaceBroad: { value: [...hexToLinear(FACE_SHADES.broad[1]), ...hexToLinear(FACE_SHADES.broad[0])] },
    uFaceNarrow: { value: [...hexToLinear(FACE_SHADES.narrow[1]), ...hexToLinear(FACE_SHADES.narrow[0])] },
    uFaceTop: { value: hexToLinear(FACE_SHADES.top[0]) },
  };
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => "kaskad-domino-1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
attribute float aHeight;
attribute vec3 aEdgeTop;
attribute vec3 aEdgeLow;
attribute float aFace;
uniform float uRefHeight;
varying vec3 vLocal;
varying float vHeight;
varying vec3 vEdgeTop;
varying vec3 vEdgeLow;
varying float vFace;
varying vec2 vFacing;`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
transformed.y += step(uRefHeight * 0.5, position.y) * (aHeight - uRefHeight);
vLocal = transformed;
vHeight = aHeight;
vEdgeTop = aEdgeTop;
vEdgeLow = aEdgeLow;
vFace = aFace;
vFacing = vec2(abs(objectNormal.z), normalize(mat3(instanceMatrix) * objectNormal).y);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform vec3 uDims;
uniform float uEdgeWidth;
uniform vec3 uFaceBroad[2];
uniform vec3 uFaceNarrow[2];
uniform vec3 uFaceTop;
varying vec3 vLocal;
varying float vHeight;
varying vec3 vEdgeTop;
varying vec3 vEdgeLow;
varying float vFace;
varying vec2 vFacing;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
{
  vec3 halfSize = vec3(uDims.x * 0.5, vHeight * 0.5, uDims.z * 0.5);
  vec3 q = halfSize - abs(vLocal - vec3(0.0, vHeight * 0.5, 0.0));
  float lo = min(q.x, min(q.y, q.z));
  float hi = max(q.x, max(q.y, q.z));
  float toEdge = max(q.x + q.y + q.z - lo - hi, 0.0);
  float aa = max(fwidth(toEdge), 1e-5);
  float line = 1.0 - smoothstep(uEdgeWidth, uEdgeWidth + aa * 1.5, toEdge);
  float inner = exp(-toEdge / 0.045) * 0.16;
  float height01 = clamp(vLocal.y / max(vHeight, 1e-3), 0.0, 1.0);
  vec3 edgeColor = mix(vEdgeLow, vEdgeTop, smoothstep(0.08, 0.55, height01));
  vec3 broad = mix(uFaceBroad[0], uFaceBroad[1], height01);
  vec3 narrow = mix(uFaceNarrow[0], uFaceNarrow[1], height01);
  vec3 face = mix(broad, narrow, step(0.5, vFacing.x));
  face = mix(face, uFaceTop, smoothstep(0.55, 0.95, vFacing.y));
  totalEmissiveRadiance += face + edgeColor * (line + inner) + edgeColor * vFace;
}`,
      );
  };
  return material;
}

/* ------------------------------------------------------------------------------------------------
 * Backdrop: the same gradients as the poster, in frame coordinates, composited in sRGB
 * ---------------------------------------------------------------------------------------------- */

/** A triangle that covers the whole viewport in clip space. */
export function createFullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return geometry;
}

export function createBackdropMaterial(): ShaderMaterial {
  const h = BACKDROP.haze;
  const g = BACKDROP.glow;
  return new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    dithering: true,
    uniforms: {
      /** offsetX, offsetY, frameWidth, frameHeight in drawing-buffer pixels. */
      uCrop: { value: [0, 0, 1, 1] },
      uViewHeight: { value: 1 },
      uVoid: { value: srgb(hex.void) },
      uHaze: { value: srgb(hex.monad) },
      uGlow: { value: srgb(hex.liq) },
      uHazeShape: { value: [h.cx, h.cy, h.rx, h.ry] },
      uHazeAlpha: { value: [h.alpha, h.stop] },
      uGlowShape: { value: [g.cx, g.cy, g.rx, g.ry] },
      uGlowAlpha: { value: [g.alpha, g.stop] },
    },
    vertexShader: /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`,
    fragmentShader: /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
uniform vec4 uCrop;
uniform float uViewHeight;
uniform vec3 uVoid;
uniform vec3 uHaze;
uniform vec3 uGlow;
uniform vec4 uHazeShape;
uniform vec2 uHazeAlpha;
uniform vec4 uGlowShape;
uniform vec2 uGlowAlpha;

float ellipse(vec2 uv, vec4 shape, vec2 alpha) {
  float d = length((uv - shape.xy) / shape.zw);
  return alpha.x * clamp(1.0 - d / alpha.y, 0.0, 1.0);
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uViewHeight - gl_FragCoord.y);
  vec2 uv = (px + uCrop.xy) / uCrop.zw;
  vec3 c = uVoid;
  c = mix(c, uHaze, ellipse(uv, uHazeShape, uHazeAlpha));
  c = mix(c, uGlow, ellipse(uv, uGlowShape, uGlowAlpha));
  gl_FragColor = vec4(toLinear(c), 1.0);
  #include <colorspace_fragment>
  #include <dithering_fragment>
}`,
  });
}

/* ------------------------------------------------------------------------------------------------
 * Floor: anti-aliased grid that fades with distance and toward the borders
 * ---------------------------------------------------------------------------------------------- */

/** Grid weight in linear light that reads like the poster's sRGB hairlines over the dark stage. */
const FLOOR_ALPHA = GRID_ALPHA * 1.35;

export function createFloorMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    blending: NormalBlending,
    depthWrite: false,
    uniforms: {
      uCell: { value: FLOOR.cell },
      uAlpha: { value: FLOOR_ALPHA },
      uBounds: { value: [FLOOR.minX, FLOOR.maxX, FLOOR.minZ, FLOOR.maxZ] },
      uFog: { value: [FOG.near, FOG.far] },
    },
    vertexShader: /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uCell;
uniform float uAlpha;
uniform vec4 uBounds;
uniform vec2 uFog;
varying vec3 vWorld;
varying float vDepth;

float sideFade(float v, float lo, float hi) {
  return clamp(min(v - lo, hi - v) / 4.0, 0.0, 1.0);
}

void main() {
  vec2 coord = vWorld.xz / uCell;
  vec2 w = max(fwidth(coord), vec2(1e-4));
  vec2 g = abs(fract(coord - 0.5) - 0.5) / w;
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  // Lines closer than ~2px merge into noise near the horizon: fade them out there.
  float density = clamp(1.0 - max(w.x, w.y) * 1.6, 0.0, 1.0);
  float fog = smoothstep(uFog.x, uFog.y, vDepth);
  float fade = sideFade(vWorld.x, uBounds.x, uBounds.y) * sideFade(vWorld.z, uBounds.z, uBounds.w);
  float a = uAlpha * line * density * (1.0 - fog) * fade;
  float lin = a * a * 1.6;
  gl_FragColor = vec4(vec3(lin), lin);
  // Linear → output: identity into the composer's linear buffer, sRGB when drawn straight to the canvas.
  #include <colorspace_fragment>
}`,
  });
}

/* ------------------------------------------------------------------------------------------------
 * Floor glow: a soft pool of light under each hot domino (instanced quads, additive)
 * ---------------------------------------------------------------------------------------------- */

export function createGlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uFog: { value: [FOG.near, FOG.far] } },
    vertexShader: /* glsl */ `
attribute vec3 aGlow;
varying vec2 vUv;
varying vec3 vGlow;
varying float vDepth;
void main() {
  vUv = uv;
  vGlow = aGlow;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform vec2 uFog;
varying vec2 vUv;
varying vec3 vGlow;
varying float vDepth;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float f = clamp(1.0 - r, 0.0, 1.0);
  f = f * f;
  float fog = smoothstep(uFog.x, uFog.y, vDepth);
  gl_FragColor = vec4(vGlow * f * (1.0 - fog), 1.0);
  #include <colorspace_fragment>
}`,
  });
}
