import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_BUDGET, FrameBudget, QUALITY_LEVELS, qualityLevel, type FrameVerdict } from "./frame-budget";

/** Feeds `count` frames `interval` ms apart starting after `start`; returns the verdicts and the end time. */
function run(budget: FrameBudget, start: number, count: number, interval: number) {
  const verdicts: FrameVerdict[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    t += interval;
    verdicts.push(budget.sample(t));
  }
  return { verdicts: verdicts.filter(Boolean), end: t };
}

const WINDOW = DEFAULT_FRAME_BUDGET.window;
const RUN = WINDOW + DEFAULT_FRAME_BUDGET.warmup + 1;

describe("FrameBudget", () => {
  it("stays quiet while frames keep up with the display", () => {
    const budget = new FrameBudget();
    expect(run(budget, 0, RUN * 3, 16.7).verdicts).toEqual([]);
    expect(budget.median).toBeCloseTo(16.7, 6);
    expect(budget.refreshMs).toBeCloseTo(1000 / 60, 6);
  });

  it("learns a faster display from its frames (120 Hz: 20 ms is over budget)", () => {
    const budget = new FrameBudget();
    const { end, verdicts } = run(budget, 0, RUN, 8.33);
    expect(verdicts).toEqual([]);
    expect(budget.refreshMs).toBeCloseTo(8.33, 6);
    expect(run(budget, end, RUN, 21).verdicts).toContain("decline");
  });

  it("steps down when a run of frames takes longer than 16 ms (and 1.5× the refresh interval)", () => {
    const budget = new FrameBudget();
    const { end } = run(budget, 0, RUN, 16.7);
    expect(run(budget, end, RUN, 40).verdicts).toContain("decline");
  });

  it("never mistakes idle time for slowness (on-demand rendering)", () => {
    const budget = new FrameBudget();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 1000;
      expect(budget.sample(t)).toBeNull();
      t += 16.7;
      expect(budget.sample(t)).toBeNull();
    }
    expect(budget.median).toBeNull();
  });

  it("still catches slow frames that are longer than a display interval but part of a run", () => {
    const budget = new FrameBudget();
    expect(run(budget, 0, RUN, 120).verdicts).toEqual(["decline"]);
  });

  it("skips the first frames of a run", () => {
    const budget = new FrameBudget({ window: 3, warmup: 2 });
    budget.sample(0);
    expect([budget.sample(100), budget.sample(200)]).toEqual([null, null]);
    expect([budget.sample(300), budget.sample(400), budget.sample(500)]).toEqual([null, null, "decline"]);
  });

  it("steps back up once after a long stretch of fast frames", () => {
    const budget = new FrameBudget({ goodWindows: 2, maxInclines: 1 });
    const fast = run(budget, 0, RUN + WINDOW * 3, 16.7);
    expect(fast.verdicts).toEqual(["incline"]);
    expect(run(budget, fast.end, WINDOW * 10, 16.7).verdicts).toEqual([]);
  });

  it("forgets the current run on reset", () => {
    const budget = new FrameBudget({ window: 2, warmup: 0 });
    budget.sample(0);
    budget.sample(50);
    budget.reset();
    expect(budget.sample(100)).toBeNull();
    expect(budget.sample(150)).toBeNull();
    expect(budget.sample(200)).toBe("decline");
  });
});

describe("quality levels", () => {
  it("lower the pixel ratio and drop bloom and MSAA step by step", () => {
    expect(QUALITY_LEVELS.map((q) => q.name)).toEqual(["low", "medium", "high"]);
    expect(QUALITY_LEVELS[2].dprMax).toBe(1.75);
    expect(QUALITY_LEVELS[0].dprMax).toBe(1);
    expect(QUALITY_LEVELS[0].bloom).toBe(false);
    expect(QUALITY_LEVELS.every((q, i) => i === 0 || q.dprMax > QUALITY_LEVELS[i - 1].dprMax)).toBe(true);
    expect([qualityLevel("low"), qualityLevel("medium"), qualityLevel("high")]).toEqual([0, 1, 2]);
  });
});
