"use client";

/**
 * The hero scene: a row of dark monoliths, one per borrower, that tips over as the price falls.
 * WebGL through react-three-fiber. Load it only through `next/dynamic` with `ssr: false` (HeroStage
 * does), so three.js, R3F and postprocessing stay in a lazy chunk outside the page's initial JS.
 *
 * Rendering is on demand: a frame is drawn only when progress, the pointer, the size or the quality
 * changes. The canvas pauses off screen and in hidden tabs, and steps its quality down (bloom, pixel
 * ratio) when frames run over budget.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Color,
  DynamicDrawUsage,
  Fog,
  HalfFloatType,
  InstancedBufferAttribute,
  Matrix4,
  PlaneGeometry,
  Vector2,
  type BufferGeometry,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera,
  type ShaderMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { hex } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { useFinePointer, usePrefersReducedMotion } from "@/motion/hooks";
import { FrameBudget, QUALITY_LEVELS, qualityLevel, type QualityLevel, type QualityName } from "./frame-budget";
import { buildHeroModel, DOMINO, poseAt, type HeroModel, type HeroPosition } from "./model";
import { dominoLook, poolOf } from "./palette";
import { readProgress, subscribeProgress, type ProgressSource } from "./progress";
import { createEnvironment } from "./scene/environment";
import { createBackdropMaterial, createDominoMaterial, createFloorMaterial, createFullscreenTriangle, createGlowMaterial, REF_HEIGHT } from "./scene/materials";
import { cameraBasis, CLIP, FLOOR, FOG, frameCrop, framingFor, FRAMINGS, type Framing } from "./stage";

export type HeroQuality = "auto" | QualityName;

export type HeroStats = {
  /** Frames per second over the last run of consecutive frames (null while idle). */
  fps: number | null;
  /** Median frame interval of that run, ms. */
  frameMs: number | null;
  dpr: number;
  quality: QualityName;
  bloom: boolean;
  /** Frames rendered since mount (on-demand rendering keeps this low while idle). */
  frames: number;
};

export type HeroSceneProps = {
  /** Classified positions (`heroFromClassification`); absent: the neutral loading row. */
  positions?: readonly HeroPosition[] | null;
  /** Timeline progress 0–1: a number, or a MotionValue for scroll-driven updates without re-renders. */
  progress?: ProgressSource;
  /** Dominoes in the neutral row (the landing passes the book's real position count). */
  placeholderCount?: number;
  /**
   * `auto` (default) starts high and steps down while frames run over budget; `high` / `medium` /
   * `low` pin a level (recordings, demo mode, comparisons).
   */
  quality?: HeroQuality;
  /** Camera parallax on fine pointers (never with reduced motion). */
  parallax?: boolean;
  /** First complete frame is on screen: cross-fade the canvas in. */
  onReady?: () => void;
  /** Readout for /design (about twice a second while frames are drawn). */
  onStats?: (stats: HeroStats) => void;
  /** The WebGL context was lost: fall back to the poster. */
  onContextLost?: () => void;
  className?: string;
};

/** Camera travel for pointer parallax (world units along the camera's right / up axes). */
const PARALLAX = { x: 0.55, y: 0.22 } as const;
/** Emission of a domino edge per unit of look intensity (HDR: bloom picks up what exceeds ~0.4). */
const EDGE_GAIN = 1;
/** Floor pool brightness per unit of heat. */
const POOL_GAIN = 0.3;

export function HeroScene({
  positions,
  progress = 0,
  placeholderCount,
  quality = "auto",
  parallax = true,
  onReady,
  onStats,
  onContextLost,
  className,
}: HeroSceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const finePointer = useFinePointer();
  const reducedMotion = usePrefersReducedMotion();
  const model = useMemo(() => buildHeroModel(positions, { placeholderCount }), [positions, placeholderCount]);
  const top: QualityLevel = quality === "auto" ? 2 : qualityLevel(quality);
  // Steps the frame budget took below `top`; the level is derived, so a new `quality` applies at once.
  const [drop, setDrop] = useState(0);
  const level = Math.max(0, top - drop) as QualityLevel;

  // Pause when off screen or in a hidden tab: frameloop "never" ignores invalidations.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let inView = true;
    let shown = document.visibilityState !== "hidden";
    const update = () => setVisible(inView && shown);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(node);
    const onVisibility = () => {
      shown = document.visibilityState !== "hidden";
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div ref={container} aria-hidden data-hero-scene="" className={cn("pointer-events-none absolute inset-0", className)}>
      <Canvas
        frameloop={visible ? "demand" : "never"}
        dpr={[1, QUALITY_LEVELS[level].dprMax]}
        flat
        gl={{ antialias: false, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
        camera={{ manual: true, fov: FRAMINGS.wide.fov, near: CLIP.near, far: CLIP.far, position: [...FRAMINGS.wide.position] }}
        onCreated={({ gl }) => gl.setClearColor(new Color(hex.void), 1)}
        style={{ pointerEvents: "none" }}
      >
        <Lighting />
        <Rig parallax={parallax && finePointer && !reducedMotion} />
        <Backdrop />
        <Floor />
        <Dominoes model={model} progress={progress} />
        <Renderer
          level={level}
          top={top}
          adaptive={quality === "auto"}
          onLevel={(next) => setDrop(top - next)}
          onReady={onReady}
          onStats={onStats}
          onContextLost={onContextLost}
        />
      </Canvas>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Camera
 * ---------------------------------------------------------------------------------------------- */

function placeCamera(camera: PerspectiveCamera, framing: Framing, offset: { x: number; y: number }) {
  const { right, up } = cameraBasis(framing);
  const [x, y, z] = framing.position;
  const dx = offset.x * PARALLAX.x;
  const dy = -offset.y * PARALLAX.y;
  camera.position.set(x + right[0] * dx + up[0] * dy, y + right[1] * dx + up[1] * dy, z + right[2] * dx + up[2] * dy);
  camera.lookAt(...framing.target);
}

/** Framing and crop for the canvas size (the poster applies the same in CSS), plus pointer parallax. */
function Rig({ parallax }: { parallax: boolean }) {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  const framing = useRef<Framing>(FRAMINGS.wide);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!width || !height) return;
    const camera = get().camera as PerspectiveCamera;
    const next = framingFor(width, height);
    const crop = frameCrop(width, height, next);
    framing.current = next;
    camera.fov = next.fov;
    camera.aspect = next.aspect;
    camera.near = CLIP.near;
    camera.far = CLIP.far;
    camera.setViewOffset(crop.frameWidth, crop.frameHeight, crop.offsetX, crop.offsetY, width, height);
    camera.updateProjectionMatrix();
    placeCamera(camera, next, current.current);
    invalidate();
  }, [get, width, height, invalidate]);

  useEffect(() => {
    target.current = { x: 0, y: 0 };
    invalidate();
    if (!parallax) return;
    const onMove = (event: PointerEvent) => {
      target.current = { x: (event.clientX / window.innerWidth) * 2 - 1, y: (event.clientY / window.innerHeight) * 2 - 1 };
      invalidate();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [parallax, invalidate]);

  useFrame((state, delta) => {
    const c = current.current;
    const t = target.current;
    const k = 1 - Math.exp(-Math.min(delta, 1 / 20) * 5);
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    if (Math.abs(t.x - c.x) + Math.abs(t.y - c.y) < 5e-4) {
      c.x = t.x;
      c.y = t.y;
    } else invalidate();
    placeCamera(state.camera as PerspectiveCamera, framing.current, c);
  });
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Stage: backdrop, floor, lights
 * ---------------------------------------------------------------------------------------------- */

function Backdrop() {
  const geometry = useMemo(() => createFullscreenTriangle(), []);
  const material = useMemo(() => createBackdropMaterial(), []);
  const mesh = useRef<Mesh<BufferGeometry, ShaderMaterial>>(null);
  const applied = useRef("");
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // The gradients live in frame coordinates, like the poster: follow the crop and the pixel ratio.
  useFrame(({ size, viewport }) => {
    const key = `${size.width}x${size.height}@${viewport.dpr}`;
    const uniforms = mesh.current?.material.uniforms;
    if (!uniforms || !size.width || !size.height || applied.current === key) return;
    const crop = frameCrop(size.width, size.height, framingFor(size.width, size.height));
    const dpr = viewport.dpr;
    uniforms.uCrop.value = [crop.offsetX * dpr, crop.offsetY * dpr, crop.frameWidth * dpr, crop.frameHeight * dpr];
    uniforms.uViewHeight.value = Math.floor(size.height * dpr);
    applied.current = key;
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1000} dispose={null} />;
}

function Floor() {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(FLOOR.maxX - FLOOR.minX, FLOOR.maxZ - FLOOR.minZ);
    g.rotateX(-Math.PI / 2);
    g.translate((FLOOR.minX + FLOOR.maxX) / 2, 0, (FLOOR.minZ + FLOOR.maxZ) / 2);
    return g;
  }, []);
  const material = useMemo(() => createFloorMaterial(), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return <mesh geometry={geometry} material={material} renderOrder={1} dispose={null} />;
}

function Lighting() {
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    const { gl, scene } = get();
    const environment = createEnvironment(gl);
    scene.environment = environment.texture;
    scene.fog = new Fog(new Color(hex.void), FOG.near, FOG.far);
    return () => {
      scene.environment = null;
      scene.fog = null;
      environment.dispose();
    };
  }, [get]);
  return (
    <>
      {/* Faint purple key from above and behind: the haze catching the tops. */}
      <directionalLight position={[4, 9, -5]} intensity={0.55} color={hex["monad-hi"]} />
      {/* Thin red rim from behind, low over the floor. */}
      <pointLight position={[7, 0.25, -1.6]} intensity={2.2} distance={12} decay={2} color={hex.liq} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Dominoes
 * ---------------------------------------------------------------------------------------------- */

function useProgressRef(progress: ProgressSource): RefObject<number> {
  const invalidate = useThree((s) => s.invalidate);
  const ref = useRef(readProgress(progress));
  useEffect(() => {
    ref.current = readProgress(progress);
    invalidate();
    return subscribeProgress(progress, () => {
      ref.current = readProgress(progress);
      invalidate();
    });
  }, [progress, invalidate]);
  return ref;
}

const scratch = new Matrix4();

function Dominoes({ model, progress }: { model: HeroModel; progress: ProgressSource }) {
  const invalidate = useThree((s) => s.invalidate);
  const progressRef = useProgressRef(progress);
  const count = model.dominoes.length;
  const slabs = useRef<InstancedMesh>(null);
  const pools = useRef<InstancedMesh>(null);
  const applied = useRef<{ model: HeroModel; progress: number } | null>(null);
  const angles = useRef<Float64Array>(new Float64Array(0));

  const geometry = useMemo(() => {
    const g = new RoundedBoxGeometry(DOMINO.thickness, REF_HEIGHT, DOMINO.width, 3, DOMINO.bevel);
    g.translate(0, REF_HEIGHT / 2, 0);
    const attribute = (size: number) => new InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(DynamicDrawUsage);
    g.setAttribute("aHeight", attribute(1));
    g.setAttribute("aEdgeTop", attribute(3));
    g.setAttribute("aEdgeLow", attribute(3));
    g.setAttribute("aFace", attribute(1));
    return g;
  }, [count]);
  const poolGeometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("aGlow", new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
    return g;
  }, [count]);
  const material = useMemo(() => createDominoMaterial(), []);
  const poolMaterial = useMemo(() => createGlowMaterial(), []);
  useEffect(
    () => () => {
      geometry.dispose();
      poolGeometry.dispose();
    },
    [geometry, poolGeometry],
  );
  useEffect(
    () => () => {
      material.dispose();
      poolMaterial.dispose();
    },
    [material, poolMaterial],
  );

  useLayoutEffect(() => {
    const heights = geometry.getAttribute("aHeight") as InstancedBufferAttribute;
    model.dominoes.forEach((d, i) => heights.setX(i, d.height));
    heights.needsUpdate = true;
    applied.current = null;
    invalidate();
  }, [geometry, model, invalidate]);

  useFrame(() => {
    const p = progressRef.current;
    const mesh = slabs.current;
    const poolMesh = pools.current;
    if (!mesh || !poolMesh) return;
    if (applied.current?.model === model && applied.current.progress === p) return;
    angles.current = poseAt(model, p, angles.current.length === count ? angles.current : undefined);
    const edgeTop = geometry.getAttribute("aEdgeTop") as InstancedBufferAttribute;
    const edgeLow = geometry.getAttribute("aEdgeLow") as InstancedBufferAttribute;
    const face = geometry.getAttribute("aFace") as InstancedBufferAttribute;
    const glow = poolGeometry.getAttribute("aGlow") as InstancedBufferAttribute;
    const t = DOMINO.thickness;
    model.dominoes.forEach((d, i) => {
      const angle = angles.current[i];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const ox = d.x + t / 2 - (t / 2) * c;
      const oy = (t / 2) * s;
      scratch.makeRotationZ(-angle).setPosition(ox, oy, 0);
      mesh.setMatrixAt(i, scratch);

      const look = dominoLook(d, p);
      const k = look.intensity * EDGE_GAIN;
      edgeTop.setXYZ(i, look.top[0] * k, look.top[1] * k, look.top[2] * k);
      edgeLow.setXYZ(i, look.low[0] * k, look.low[1] * k, look.low[2] * k);
      face.setX(i, look.face);

      // The edge light spilled on the floor around the domino (same ellipse as the poster).
      const pool = poolOf(look);
      const cx = ox + (d.height / 2) * s;
      if (pool) scratch.makeScale(pool.radiusX * 2, 1, pool.radiusZ * 2).setPosition(cx, 0.004, pool.z);
      else scratch.makeScale(0, 0, 0);
      poolMesh.setMatrixAt(i, scratch);
      const g = (pool?.heat ?? 0) * POOL_GAIN;
      glow.setXYZ(i, ((look.top[0] + look.low[0]) / 2) * g, ((look.top[1] + look.low[1]) / 2) * g, ((look.top[2] + look.low[2]) / 2) * g);
    });
    mesh.instanceMatrix.needsUpdate = true;
    poolMesh.instanceMatrix.needsUpdate = true;
    edgeTop.needsUpdate = true;
    edgeLow.needsUpdate = true;
    face.needsUpdate = true;
    glow.needsUpdate = true;
    applied.current = { model, progress: p };
  });

  return (
    <>
      <instancedMesh ref={slabs} args={[geometry, material, count]} frustumCulled={false} dispose={null} />
      <instancedMesh ref={pools} args={[poolGeometry, poolMaterial, count]} frustumCulled={false} renderOrder={2} dispose={null} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Rendering: bloom composer, frame budget, readiness
 * ---------------------------------------------------------------------------------------------- */

const STATS_INTERVAL_MS = 500;

function Renderer({
  level,
  top,
  adaptive,
  onLevel,
  onReady,
  onStats,
  onContextLost,
}: {
  level: QualityLevel;
  top: QualityLevel;
  /** Only `auto` quality follows the frame budget. */
  adaptive: boolean;
  onLevel: (level: QualityLevel) => void;
  onReady?: () => void;
  onStats?: (stats: HeroStats) => void;
  onContextLost?: () => void;
}) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const [compiled, setCompiled] = useState(false);
  const pipeline = useRef<{ composer: EffectComposer; bloom: BloomEffect } | null>(null);
  const budget = useRef<FrameBudget | null>(null);
  const size = useRef(new Vector2());
  const appliedSize = useRef({ width: -1, height: -1 });
  const ready = useRef(false);
  const frames = useRef(0);
  const lastStats = useRef(0);
  const callbacks = useRef({ onReady, onStats, onContextLost });
  useLayoutEffect(() => {
    callbacks.current = { onReady, onStats, onContextLost };
  });

  // Bloom pipeline: HDR buffers so only the hot edges (emission above ~0.4) glow.
  useEffect(() => {
    const { gl, scene, camera } = get();
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: 0 });
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.42, luminanceSmoothing: 0.25, intensity: 0.6, radius: 0.62, levels: 6 });
    const effects = new EffectPass(camera, bloom);
    effects.dithering = true;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effects);
    pipeline.current = { composer, bloom };
    budget.current = new FrameBudget();
    return () => {
      pipeline.current = null;
      composer.dispose();
    };
  }, [get]);

  useEffect(() => {
    const current = pipeline.current;
    if (current) current.composer.multisampling = QUALITY_LEVELS[level].msaa;
    appliedSize.current = { width: -1, height: -1 };
    budget.current?.reset();
    invalidate();
  }, [level, invalidate]);

  // Compile every program before the first frame (off the main thread where the browser can).
  useEffect(() => {
    let alive = true;
    const { gl, scene, camera } = get();
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        setCompiled(true);
        invalidate();
      });
    return () => {
      alive = false;
    };
  }, [get, invalidate]);

  useEffect(() => {
    const canvas = get().gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      callbacks.current.onContextLost?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [get]);

  useFrame(({ gl, scene, camera }, delta) => {
    if (!compiled) return;
    const q = QUALITY_LEVELS[level];
    const bloom = q.bloom ? pipeline.current : null;
    if (bloom) {
      gl.getDrawingBufferSize(size.current);
      if (size.current.x !== appliedSize.current.width || size.current.y !== appliedSize.current.height) {
        const css = gl.getSize(new Vector2());
        bloom.composer.setSize(css.x, css.y);
        appliedSize.current = { width: size.current.x, height: size.current.y };
      }
      bloom.composer.render(delta);
    } else {
      gl.render(scene, camera);
    }
    frames.current++;

    const now = performance.now();
    const verdict = budget.current?.sample(now) ?? null;
    if (adaptive && verdict === "decline" && level > 0) onLevel((level - 1) as QualityLevel);
    else if (adaptive && verdict === "incline" && level < top) onLevel((level + 1) as QualityLevel);

    if (!ready.current) {
      ready.current = true;
      requestAnimationFrame(() => callbacks.current.onReady?.());
    }
    const report = callbacks.current.onStats;
    if (report && (now - lastStats.current > STATS_INTERVAL_MS || verdict)) {
      lastStats.current = now;
      const median = budget.current?.median ?? null;
      report({
        fps: median ? Math.round(1000 / median) : null,
        frameMs: median ? Math.round(median * 10) / 10 : null,
        dpr: Math.round(gl.getPixelRatio() * 100) / 100,
        quality: q.name,
        bloom: Boolean(bloom),
        frames: frames.current,
      });
    }
  }, 1);

  return null;
}
