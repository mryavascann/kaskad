import { describe, expect, it } from "vitest";
import { chooseHeroMode, readHeroEnv, type HeroEnv } from "./capability";

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

  it("honours a forced mode, but the scene still needs WebGL 2", () => {
    expect(chooseHeroMode(CAPABLE, "poster")).toEqual({ mode: "poster", reason: "forced-poster" });
    expect(chooseHeroMode({ ...CAPABLE, reducedMotion: true, softwareRenderer: true }, "scene")).toEqual({ mode: "scene", reason: "forced-scene" });
    expect(chooseHeroMode({ ...CAPABLE, webgl2: false }, "scene")).toEqual({ mode: "poster", reason: "no-webgl" });
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
    expect(env).toEqual({ reducedMotion: true, webgl2: true, softwareRenderer: false, cores: 8, memoryGb: 4, saveData: true });
    expect(chooseHeroMode(env).reason).toBe("reduced-motion");
  });

  it("treats missing or odd hints as unknown, not as low-end", () => {
    const env = readHeroEnv(fakeWindow({ hardwareConcurrency: 0 }), () => ({ webgl2: true, softwareRenderer: true }));
    expect(env.cores).toBeUndefined();
    expect(env.memoryGb).toBeUndefined();
    expect(env.saveData).toBe(false);
    expect(chooseHeroMode(env).reason).toBe("software-renderer");
  });
});
