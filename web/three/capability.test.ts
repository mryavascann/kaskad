import { describe, expect, it, vi } from "vitest";
import { chooseHeroMode, isSoftwareRendererName, probeWebGL, readHeroEnv, type HeroEnv } from "./capability";

const CAPABLE: HeroEnv = { reducedMotion: false, webgl2: true, softwareRenderer: false, cores: 8, memoryGb: 8, saveData: false };

describe("chooseHeroMode", () => {
  it("picks the scene on a capable device", () => {
    expect(chooseHeroMode(CAPABLE)).toEqual({ mode: "scene", reason: "capable" });
    expect(chooseHeroMode({ reducedMotion: false, webgl2: true, softwareRenderer: false })).toEqual({ mode: "scene", reason: "capable" });
  });

  it.each([
    [{ reducedMotion: true }, "reduced-motion"],
    [{ webgl2: false }, "no-webgl"],
    [{ saveData: true }, "save-data"],
    [{ cores: 2 }, "low-cpu"],
    [{ cores: 1 }, "low-cpu"],
    [{ memoryGb: 2 }, "low-memory"],
    [{ memoryGb: 0.5 }, "low-memory"],
    [{ softwareRenderer: true }, "software-renderer"],
  ] as const)("keeps the poster for %o (%s)", (patch, reason) => {
    expect(chooseHeroMode({ ...CAPABLE, ...patch })).toEqual({ mode: "poster", reason });
  });

  it("accepts devices just above the low-end limits", () => {
    expect(chooseHeroMode({ ...CAPABLE, cores: 3, memoryGb: 4 }).mode).toBe("scene");
  });

  it("puts reduced motion before device limits", () => {
    expect(chooseHeroMode({ ...CAPABLE, reducedMotion: true, cores: 1, softwareRenderer: true }).reason).toBe("reduced-motion");
  });

  it("waits for the first interaction on touch-first small screens", () => {
    expect(chooseHeroMode({ ...CAPABLE, touchFirst: true })).toEqual({ mode: "scene", reason: "capable", defer: "interaction" });
    // Device limits still come first.
    expect(chooseHeroMode({ ...CAPABLE, touchFirst: true, softwareRenderer: true })).toEqual({ mode: "poster", reason: "software-renderer" });
    // A forced scene loads right away.
    expect(chooseHeroMode({ ...CAPABLE, touchFirst: true }, "scene")).toEqual({ mode: "scene", reason: "forced-scene" });
  });

  it("demo mode forces the scene past device checks, but not past reduced motion or missing WebGL 2", () => {
    const weak: HeroEnv = { ...CAPABLE, demo: true, softwareRenderer: true, cores: 2, memoryGb: 1, saveData: true, touchFirst: true };
    expect(chooseHeroMode(weak)).toEqual({ mode: "scene", reason: "forced-scene" });
    expect(chooseHeroMode({ ...weak, reducedMotion: true }).reason).toBe("reduced-motion");
    expect(chooseHeroMode({ ...weak, webgl2: false }).reason).toBe("no-webgl");
    expect(chooseHeroMode(weak, "poster").reason).toBe("forced-poster");
  });

  it("honours a forced mode, but the scene still needs WebGL 2", () => {
    expect(chooseHeroMode(CAPABLE, "poster")).toEqual({ mode: "poster", reason: "forced-poster" });
    expect(chooseHeroMode({ ...CAPABLE, reducedMotion: true, softwareRenderer: true }, "scene")).toEqual({ mode: "scene", reason: "forced-scene" });
    expect(chooseHeroMode({ ...CAPABLE, webgl2: false }, "scene")).toEqual({ mode: "poster", reason: "no-webgl" });
  });
});

describe("isSoftwareRendererName", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "Google SwiftShader",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Mesa softpipe",
    "Microsoft Basic Render Driver",
    "Apple Software Renderer",
  ])("flags %s", (name) => expect(isSoftwareRendererName(name)).toBe(true));

  it.each(["ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)", "Apple M2", "Adreno (TM) 740", "Mali-G78", "", null, undefined])(
    "accepts %s",
    (name) => expect(isSoftwareRendererName(name)).toBe(false),
  );
});

describe("probeWebGL", () => {
  const RENDERER = 0x1f01;
  const UNMASKED = 0x9246;
  /** A document whose canvases hand out a fake WebGL 2 context per attempt (null = refused). */
  const fakeDoc = (attempts: ({ renderer: string; debugInfo?: boolean } | null)[]) => {
    const loseContext = vi.fn();
    const doc = {
      createElement: () => ({
        getContext: () => {
          const next = attempts.shift() ?? null;
          if (!next) return null;
          return {
            RENDERER,
            getExtension: (name: string) =>
              name === "WEBGL_debug_renderer_info" ? (next.debugInfo === false ? null : { UNMASKED_RENDERER_WEBGL: UNMASKED }) : { loseContext },
            getParameter: (p: number) => (p === UNMASKED || p === RENDERER ? next.renderer : null),
          };
        },
      }),
    } as unknown as Document;
    return { doc, loseContext };
  };

  it("reports a hardware GPU from the strict context", () => {
    const { doc, loseContext } = fakeDoc([{ renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)" }]);
    expect(probeWebGL(doc)).toEqual({ webgl2: true, softwareRenderer: false });
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("flags SwiftShader even when failIfMajorPerformanceCaveat lets it through", () => {
    const { doc } = fakeDoc([{ renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)" }]);
    expect(probeWebGL(doc)).toEqual({ webgl2: true, softwareRenderer: true });
  });

  it("reads the plain RENDERER when the debug extension is missing", () => {
    const { doc } = fakeDoc([{ renderer: "llvmpipe", debugInfo: false }]);
    expect(probeWebGL(doc).softwareRenderer).toBe(true);
  });

  it("treats a context that only exists without the caveat flag as software, and none as no WebGL", () => {
    expect(probeWebGL(fakeDoc([null, { renderer: "Adreno (TM) 740" }]).doc)).toEqual({ webgl2: true, softwareRenderer: true });
    expect(probeWebGL(fakeDoc([null, null]).doc)).toEqual({ webgl2: false, softwareRenderer: false });
  });
});

describe("readHeroEnv", () => {
  const fakeWindow = (navigator: Record<string, unknown>, reduce = false) =>
    ({
      navigator,
      document: {},
      matchMedia: (query: string) => ({ matches: reduce && query.includes("reduce") }),
    }) as unknown as Window;

  it("reads the device hints and the reduced-motion setting", () => {
    const env = readHeroEnv(
      fakeWindow({ hardwareConcurrency: 8, deviceMemory: 4, connection: { saveData: true } }, true),
      () => ({ webgl2: true, softwareRenderer: false }),
    );
    expect(env).toEqual({ reducedMotion: true, touchFirst: false, demo: false, webgl2: true, softwareRenderer: false, cores: 8, memoryGb: 4, saveData: true });
    expect(chooseHeroMode(env).reason).toBe("reduced-motion");
  });

  it("treats missing or odd hints as unknown, not as low-end", () => {
    const env = readHeroEnv(fakeWindow({ hardwareConcurrency: 0 }), () => ({ webgl2: true, softwareRenderer: true }));
    expect(env.cores).toBeUndefined();
    expect(env.memoryGb).toBeUndefined();
    expect(env.saveData).toBe(false);
    expect(chooseHeroMode(env).reason).toBe("software-renderer");
  });

  it("reads a touch-first small screen and passes demo mode through", () => {
    const win = {
      navigator: { hardwareConcurrency: 8 },
      document: {},
      matchMedia: (query: string) => ({ matches: query.includes("pointer: coarse") }),
    } as unknown as Window;
    const env = readHeroEnv(win, () => ({ webgl2: true, softwareRenderer: false }), true);
    expect(env).toMatchObject({ touchFirst: true, demo: true, reducedMotion: false });
    expect(chooseHeroMode(env)).toEqual({ mode: "scene", reason: "forced-scene" });
    expect(chooseHeroMode({ ...env, demo: false })).toEqual({ mode: "scene", reason: "capable", defer: "interaction" });
  });
});
