/**
 * Scene or poster? A pure decision (`chooseHeroMode`) over what the browser reports (`readHeroEnv`,
 * client only, called after hydration: the server always renders the poster).
 */

export type HeroEnv = {
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** A WebGL 2 context can be created (three.js needs WebGL 2). */
  webgl2: boolean;
  /** WebGL 2 only without `failIfMajorPerformanceCaveat`: a software rasterizer or a blocklisted GPU. */
  softwareRenderer: boolean;
  /** `navigator.hardwareConcurrency` (logical cores), when reported. */
  cores?: number;
  /** `navigator.deviceMemory` (GB, rounded down by the browser), when reported. */
  memoryGb?: number;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
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

export type HeroModeDecision = { mode: "scene" | "poster"; reason: HeroModeReason };

/** Devices at or below these get the poster. */
export const LOW_END = { cores: 2, memoryGb: 2 } as const;

/**
 * The poster is the default; the scene needs WebGL 2, no reduced-motion preference, no data saver,
 * more than 2 cores and 2 GB, and a hardware renderer. `scene` still needs WebGL 2.
 */
export function chooseHeroMode(env: HeroEnv, preference: HeroModePreference = "auto"): HeroModeDecision {
  if (preference === "poster") return { mode: "poster", reason: "forced-poster" };
  if (!env.webgl2) return { mode: "poster", reason: "no-webgl" };
  if (preference === "scene") return { mode: "scene", reason: "forced-scene" };
  if (env.reducedMotion) return { mode: "poster", reason: "reduced-motion" };
  if (env.saveData) return { mode: "poster", reason: "save-data" };
  if (env.cores !== undefined && env.cores <= LOW_END.cores) return { mode: "poster", reason: "low-cpu" };
  if (env.memoryGb !== undefined && env.memoryGb <= LOW_END.memoryGb) return { mode: "poster", reason: "low-memory" };
  if (env.softwareRenderer) return { mode: "poster", reason: "software-renderer" };
  return { mode: "scene", reason: "capable" };
}

type WebGLProbe = { webgl2: boolean; softwareRenderer: boolean };

/** Creates (and immediately releases) throwaway WebGL 2 contexts to see what the browser offers. */
export function probeWebGL(doc: Document): WebGLProbe {
  const attempt = (attributes: WebGLContextAttributes) => {
    try {
      const canvas = doc.createElement("canvas");
      const gl = canvas.getContext("webgl2", attributes);
      if (!gl) return false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  };
  if (attempt({ failIfMajorPerformanceCaveat: true, powerPreference: "high-performance" })) return { webgl2: true, softwareRenderer: false };
  const any = attempt({});
  return { webgl2: any, softwareRenderer: any };
}

type NavigatorExtras = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** What this browser reports. Client only. `probe` is injectable for tests. */
export function readHeroEnv(win: Window = window, probe: (doc: Document) => WebGLProbe = probeWebGL): HeroEnv {
  const nav = win.navigator as NavigatorExtras;
  const { webgl2, softwareRenderer } = probe(win.document);
  const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined);
  return {
    reducedMotion: win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    webgl2,
    softwareRenderer,
    cores: finite(nav.hardwareConcurrency),
    memoryGb: finite(nav.deviceMemory),
    saveData: nav.connection?.saveData === true,
  };
}
