import { describe, expect, it } from "vitest";
import { cameraBasis, FOG, fogAt, frameCrop, framingFor, FRAMINGS, makeProjector, TALL_BELOW } from "./stage";

describe("framing", () => {
  it("uses the tall framing for portrait containers", () => {
    expect(framingFor(1440, 900)).toBe(FRAMINGS.wide);
    expect(framingFor(390, 844)).toBe(FRAMINGS.tall);
    expect(framingFor(1000, 1000 / TALL_BELOW)).toBe(FRAMINGS.wide);
    expect(framingFor(100, 0)).toBe(FRAMINGS.wide);
  });

  it("covers a wider container: full width, cropped top and bottom", () => {
    const f = FRAMINGS.wide;
    const crop = frameCrop(2000, 600, f);
    expect(crop.frameWidth).toBe(2000);
    expect(crop.frameHeight).toBeCloseTo(2000 / f.aspect, 9);
    expect(crop.offsetX).toBe(0);
    expect(crop.offsetY).toBeCloseTo((crop.frameHeight - 600) * f.alignY, 9);
  });

  it("covers a narrower container: full height, cropped at the sides by alignX", () => {
    const f = FRAMINGS.tall;
    const crop = frameCrop(300, 800, f);
    expect(crop.frameHeight).toBe(800);
    expect(crop.frameWidth).toBeCloseTo(800 * f.aspect, 9);
    expect(crop.offsetX).toBeCloseTo((crop.frameWidth - 300) * f.alignX, 9);
    expect(crop.offsetY).toBe(0);
  });

  it("fits exactly when the container has the frame's aspect", () => {
    const crop = frameCrop(1600, 900, FRAMINGS.wide);
    expect(crop.frameWidth).toBeCloseTo(1600, 9);
    expect(crop.offsetX).toBeCloseTo(0, 9);
    expect(crop.offsetY).toBeCloseTo(0, 9);
  });
});

describe("projection", () => {
  for (const framing of [FRAMINGS.wide, FRAMINGS.tall]) {
    it(`puts the ${framing.name} target in the middle of the frame`, () => {
      const project = makeProjector(framing, 1000);
      const [x, y, z] = framing.target;
      const p = project(x, y, z);
      expect(p.x).toBeCloseTo((1000 * framing.aspect) / 2, 6);
      expect(p.y).toBeCloseTo(500, 6);
      expect(p.depth).toBeGreaterThan(0);
    });
  }

  it("keeps the camera basis orthonormal with +y up", () => {
    const { right, up, forward } = cameraBasis(FRAMINGS.wide);
    const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(right, up)).toBeCloseTo(0, 12);
    expect(dot(right, forward)).toBeCloseTo(0, 12);
    expect(dot(up, forward)).toBeCloseTo(0, 12);
    expect(dot(right, right)).toBeCloseTo(1, 12);
    expect(up[1]).toBeGreaterThan(0);
    expect(right[1]).toBeCloseTo(0, 12);
  });

  it("puts the start of the row left of its end, and both in the lower half", () => {
    const project = makeProjector(FRAMINGS.wide, 1000);
    const start = project(0, 0, 0);
    const end = project(22, 0, 0);
    expect(start.x).toBeLessThan(end.x);
    expect(start.x).toBeGreaterThan(0);
    expect(start.y).toBeGreaterThan(500);
    expect(end.y).toBeGreaterThan(500);
  });

  it("reports points behind the camera with a negative depth", () => {
    const f = FRAMINGS.wide;
    const back = [2 * f.position[0] - f.target[0], 2 * f.position[1] - f.target[1], 2 * f.position[2] - f.target[2]] as const;
    expect(makeProjector(f)(...back).depth).toBeLessThan(0);
  });
});

describe("fogAt", () => {
  it("is smoothstep(near, far, depth), like three.js linear fog", () => {
    expect(fogAt(0)).toBe(0);
    expect(fogAt(FOG.near)).toBe(0);
    expect(fogAt(FOG.far)).toBe(1);
    expect(fogAt((FOG.near + FOG.far) / 2)).toBeCloseTo(0.5, 12);
  });
});
