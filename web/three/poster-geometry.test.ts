import { describe, expect, it } from "vitest";
import { classifyPositions } from "@/lib/chain/book";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { heroFromClassification } from "./data";
import { buildHeroModel, DOMINO, poseAt } from "./model";
import { hexToLinear, linearToHex, SCENE_COLORS } from "./palette";
import { boxCorners, fogged, fogLevel, FOG_LEVELS, GRID_ALPHA, POSTER_HEIGHT, posterFrame } from "./poster-geometry";
import { FRAMINGS, type Framing } from "./stage";

const run = fixtureRun("sali");
const c = classifyPositions(run.book, run.result, run.scenario);
if (!c.consistent) throw new Error("fixture replay mismatch");
const { positions } = heroFromClassification(c.positions, run.scenario, { result: run.result });
const model = buildHeroModel(positions);
const frameAt = (p: number, framing: Framing = FRAMINGS.wide) => posterFrame(model, poseAt(model, p), p, framing);

const numbersIn = (d: string) => d.match(/-?\d+(\.\d+)?/g) ?? [];

describe("boxCorners", () => {
  it("spans the domino box when upright", () => {
    const corners = boxCorners(2, 0.8, 0);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const zs = corners.map((p) => p[2]);
    expect(Math.min(...xs)).toBeCloseTo(2 - DOMINO.thickness / 2, 12);
    expect(Math.max(...xs)).toBeCloseTo(2 + DOMINO.thickness / 2, 12);
    expect(Math.min(...ys)).toBeCloseTo(0, 12);
    expect(Math.max(...ys)).toBeCloseTo(0.8, 12);
    expect(Math.max(...zs)).toBeCloseTo(DOMINO.width / 2, 12);
  });

  it("tips about the front-bottom edge", () => {
    const pivot = [2 + DOMINO.thickness / 2, 0];
    const tipped = boxCorners(2, 0.8, 0.5);
    // The front-bottom corners stay on the pivot; the top moves forward (+x).
    expect(tipped[1][0]).toBeCloseTo(pivot[0], 12);
    expect(tipped[1][1]).toBeCloseTo(0, 12);
    expect(tipped[3][0]).toBeGreaterThan(pivot[0]);
  });
});

describe("posterFrame", () => {
  it("draws every domino, far to near", () => {
    const frame = frameAt(1);
    expect(frame.dominoes).toHaveLength(57);
    expect(frame.width).toBeCloseTo(POSTER_HEIGHT * FRAMINGS.wide.aspect, 0);
    expect(frame.dominoes[0].index).toBeGreaterThan(frame.dominoes[56].index);
    for (const d of frame.dominoes) {
      expect(d.faces.length).toBeGreaterThanOrEqual(1);
      expect(d.faces.length).toBeLessThanOrEqual(3);
      expect(d.edges.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("rounds every path coordinate to whole frame units (identical server and browser markup)", () => {
    const frame = frameAt(0.7);
    const paths = [
      ...frame.grid.map((g) => g.d),
      ...frame.dominoes.flatMap((d) => [...d.faces.map((f) => f.d), ...d.edges.map((e) => e.d), d.glow?.d ?? ""]),
    ];
    for (const path of paths)
      for (const n of numbersIn(path)) {
        expect(Number.isFinite(Number(n))).toBe(true);
        expect(n).not.toContain(".");
      }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(frameAt(0.62))).toBe(JSON.stringify(frameAt(0.62)));
    expect(JSON.stringify(frameAt(0.62, FRAMINGS.tall))).toBe(JSON.stringify(frameAt(0.62, FRAMINGS.tall)));
  });

  it("colors the fallen stuck dominoes amber and leaves the safe ones cool", () => {
    const frame = frameAt(1);
    const byIndex = new Map(frame.dominoes.map((d) => [d.index, d]));
    const amber = linearToHex(SCENE_COLORS.warn);
    expect(byIndex.get(5)?.edges[0].color).toBe(amber);
    expect(byIndex.get(5)?.glow).not.toBeNull();
    expect(byIndex.get(50)?.edges[0].color).toBe(linearToHex(SCENE_COLORS.hairline));
    expect(byIndex.get(50)?.glow).toBeNull();
    // The partly liquidated first domino keeps a red foot.
    expect(byIndex.get(0)?.edges.map((e) => e.color)).toContain(linearToHex(SCENE_COLORS.liq));
  });

  it("puts light pools only under hot dominoes", () => {
    expect(frameAt(1).pools.length).toBeGreaterThanOrEqual(30);
    expect(frameAt(0).pools.length).toBeLessThanOrEqual(1);
    expect(posterFrame(buildHeroModel(null), poseAt(buildHeroModel(null), 1), 1, FRAMINGS.wide).pools).toHaveLength(0);
  });

  it("fades the floor grid below its base opacity", () => {
    const grid = frameAt(0).grid;
    expect(grid.length).toBeGreaterThan(0);
    for (const line of grid) {
      expect(line.opacity).toBeGreaterThan(0);
      expect(line.opacity).toBeLessThanOrEqual(GRID_ALPHA);
    }
  });
});

describe("fogged / fogLevel", () => {
  it("fades a shade toward the stage color", () => {
    expect(fogged("#1c1a29", 0)).toBe("#1c1a29");
    expect(fogged("#1c1a29", 1)).toBe(linearToHex(hexToLinear(linearToHex(SCENE_COLORS.void))));
    expect(fogLevel(0)).toBe(0);
    expect(fogLevel(1)).toBe(FOG_LEVELS - 1);
    expect(fogLevel(2)).toBe(FOG_LEVELS - 1);
  });
});
