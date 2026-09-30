import { describe, expect, it } from "vitest";
import { readCustomProperties } from "@/tests/helpers/css-vars";
import { beat, cssEasing, dampingRatio, distance, duration, easing, spring, stagger, transition } from "./tokens";

const css = readCustomProperties(new URL("./tokens.css", import.meta.url));
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("motion tokens.css <-> tokens.ts", () => {
  it("mirrors durations", () => {
    for (const [name, ms] of Object.entries(duration)) expect(css.get(`dur-${kebab(name)}`), name).toBe(`${ms}ms`);
  });

  it("mirrors easings (except linear, which CSS already has)", () => {
    for (const [name, curve] of Object.entries(easing)) {
      if (name === "linear") continue;
      expect(css.get(`ease-${kebab(name)}`), name).toBe(cssEasing(curve));
    }
  });

  it("mirrors stagger, beats and travel distances", () => {
    for (const [name, ms] of Object.entries(stagger)) expect(css.get(`stagger-${name}`), name).toBe(`${ms}ms`);
    for (const [name, ms] of Object.entries(beat)) expect(css.get(`beat-${name}`), name).toBe(`${ms}ms`);
    for (const [name, px] of Object.entries(distance)) expect(css.get(name), name).toBe(`${px}px`);
  });
});

describe("motion token rules", () => {
  it("keeps durations in the brief's ranges", () => {
    expect([duration.instant, duration.fast, duration.base, duration.slow]).toEqual([80, 160, 240, 420]);
    for (const ms of [duration.scene, duration.sceneShort, duration.sceneLong]) {
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(1400);
    }
  });

  it("staggers siblings 20–60 ms apart and plays context, hero, detail in order", () => {
    for (const ms of Object.values(stagger)) {
      expect(ms).toBeGreaterThanOrEqual(20);
      expect(ms).toBeLessThanOrEqual(60);
    }
    expect(beat.context).toBeLessThan(beat.hero);
    expect(beat.hero).toBeLessThan(beat.detail);
  });

  it("uses a near-critical soft spring and underdamped impact / needle springs", () => {
    expect(spring.soft).toMatchObject({ stiffness: 260, damping: 30 });
    expect(dampingRatio(spring.soft)).toBeGreaterThan(0.85);
    expect(dampingRatio(spring.impact)).toBeLessThan(0.6);
    expect(dampingRatio(spring.needle)).toBeLessThan(dampingRatio(spring.impact));
  });

  it("builds Motion transitions from the tokens", () => {
    expect(transition.base).toEqual({ duration: 0.24, ease: easing.outExpo });
    expect(transition.scene.duration).toBeCloseTo(duration.scene / 1000);
  });
});
