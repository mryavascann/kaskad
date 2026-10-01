/**
 * Scene or poster? A pure decision (`chooseHeroMode`) over what the browser reports (`readHeroEnv`,
 * client only, called after hydration: the server always renders the poster).
 */

export type HeroEnv = {
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** A WebGL 2 context can be created (three.js needs WebGL 2). */
  webgl2: boolean;
  /**
   * A software rasterizer or a blocklisted GPU: WebGL 2 only without `failIfMajorPerformanceCaveat`,
   * or a renderer string that names one (SwiftShader, llvmpipe, …; see `isSoftwareRendererName`).
   */
  softwareRenderer: boolean;
  /** `navigator.hardwareConcurrency` (logical cores), when reported. */
  cores?: number;
  /** `navigator.deviceMemory` (GB, rounded down by the browser), when reported. */
  memoryGb?: number;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
  /**
   * A touch-first small screen (`(pointer: coarse)` and at most `TOUCH_FIRST_MAX_WIDTH` wide). The
   * scene then waits for the first interaction (scroll, touch, key), so the poster stays the LCP.
   */
  touchFirst?: boolean;
  /** Demo mode (`?demo=1`): recordings get the scene whenever WebGL 2 exists (reduced motion still wins). */
  demo?: boolean;
};

/** `auto` decides from the environment; `scene` / `poster` force a mode (e.g. the /design controls). */
export type HeroModePreference = "auto" | "scene" | "poster";

export type HeroModeReason =
  | "capable"
  | "forced-scene"
  | "forced-poster"
  | "reduced-motion"
  | "no-webgl"
  | "save-data"
  | "low-cpu"
  | "low-memory"
  | "software-renderer"
  /** The scene failed after it started (context lost, runtime error). */
  | "scene-failed";

export type HeroModeDecision = {
  mode: "scene" | "poster";
  reason: HeroModeReason;
  /** Scene only: load it after the first user interaction instead of at idle (touch-first screens). */
  defer?: "interaction";
};

/** Devices at or below these get the poster. */
export const LOW_END = { cores: 2, memoryGb: 2 } as const;

/** Widest viewport (CSS px) that counts as a phone for `touchFirst`. */
export const TOUCH_FIRST_MAX_WIDTH = 820;

/**
 * Renderer strings of CPU rasterizers: Chrome's SwiftShader (headless, blocklisted GPUs), Mesa's
 * llvmpipe / softpipe, Microsoft Basic Render Driver, Apple Software Renderer. On these one frame of
 * the scene costs hundreds of milliseconds of main-thread time.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function isSoftwareRendererName(renderer: string | null | undefined): boolean {
  return typeof renderer === "string" && SOFTWARE_RENDERER.test(renderer);
}

/**
 * The poster is the default; the scene needs WebGL 2, no reduced-motion preference, no data saver,
 * more than 2 cores and 2 GB, and a hardware renderer. On touch-first small screens it waits for the
 * first interaction. `scene` still needs WebGL 2; demo mode (`?demo=1`) also skips the device checks
 * (not reduced motion). Both load right away.
 */
export function chooseHeroMode(env: HeroEnv, preference: HeroModePreference = "auto"): HeroModeDecision {
  if (preference === "poster") return { mode: "poster", reason: "forced-poster" };
  if (!env.webgl2) return { mode: "poster", reason: "no-webgl" };
  if (preference === "scene") return { mode: "scene", reason: "forced-scene" };
  if (env.reducedMotion) return { mode: "poster", reason: "reduced-motion" };
  if (env.demo) return { mode: "scene", reason: "forced-scene" };
  if (env.saveData) return { mode: "poster", reason: "save-data" };
  if (env.cores !== undefined && env.cores <= LOW_END.cores) return { mode: "poster", reason: "low-cpu" };
  if (env.memoryGb !== undefined && env.memoryGb <= LOW_END.memoryGb) return { mode: "poster", reason: "low-memory" };
  if (env.softwareRenderer) return { mode: "poster", reason: "software-renderer" };
  if (env.touchFirst) return { mode: "scene", reason: "capable", defer: "interaction" };
  return { mode: "scene", reason: "capable" };
}

type WebGLProbe = { webgl2: boolean; softwareRenderer: boolean };

/** The unmasked renderer string (falls back to the masked one, which Chrome now also unmasks). */
export function readRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const value = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Creates (and immediately releases) throwaway WebGL 2 contexts to see what the browser offers. */
export function probeWebGL(doc: Document): WebGLProbe {
  /** `null`: no context; otherwise whether the renderer string names a software rasterizer. */
  const attempt = (attributes: WebGLContextAttributes): boolean | null => {
    try {
      const canvas = doc.createElement("canvas");
      const gl = canvas.getContext("webgl2", attributes);
      if (!gl) return null;
      const software = isSoftwareRendererName(readRenderer(gl));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return software;
    } catch {
      return null;
    }
  };
  const strict = attempt({ failIfMajorPerformanceCaveat: true, powerPreference: "high-performance" });
  if (strict !== null) return { webgl2: true, softwareRenderer: strict };
  const any = attempt({}) !== null;
  return { webgl2: any, softwareRenderer: any };
}

type NavigatorExtras = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** What this browser reports. Client only. `probe` is injectable for tests. */
export function readHeroEnv(win: Window = window, probe: (doc: Document) => WebGLProbe = probeWebGL, demo = false): HeroEnv {
  const nav = win.navigator as NavigatorExtras;
  const { webgl2, softwareRenderer } = probe(win.document);
  const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
  const media = (query: string) => win.matchMedia?.(query).matches ?? false;
  return {
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    touchFirst: media(`(pointer: coarse) and (max-width: ${TOUCH_FIRST_MAX_WIDTH}px)`),
    demo,
    webgl2,
    softwareRenderer,
    cores: finite(nav.hardwareConcurrency),
    memoryGb: finite(nav.deviceMemory),
    saveData: nav.connection?.saveData === true,
  };
}
