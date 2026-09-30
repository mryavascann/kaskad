import { describe, expect, it } from "vitest";
import { positionsOf, vizRun } from "./__fixtures__/data";
import { atEnd, byThreshold, crossingStep, dropAt, flipRanks, maxDebt, stateCounts, tileState, visibleStates, type VizPosition } from "./positions";

const sali = vizRun("sali");
const saliPositions = positionsOf(sali);
const worst = vizRun("worst");
const usde = vizRun("usde-eth-5-external");

const replayAt = (r: typeof sali, step?: number) => ({ step, steps: r.steps, prices: r.prices });

describe("byThreshold", () => {
  it("puts the position closest to liquidation first and never-liquidatable ones last", () => {
    const ordered = byThreshold(positionsOf(usde));
    const drops = ordered.map((p) => p.thresholdDrop);
    const firstNull = drops.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(drops.slice(firstNull).every((d) => d === null)).toBe(true);
    const numeric = drops.slice(0, firstNull) as number[];
    expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
  });

  it("is deterministic (ties by debt, then book order) and does not mutate its input", () => {
    const copy = [...saliPositions];
    expect(byThreshold(saliPositions).map((p) => p.index)).toEqual(byThreshold(copy).map((p) => p.index));
    expect(saliPositions).toEqual(copy);
    expect(byThreshold(saliPositions)[0].index).toBe(12);
  });
});

describe("tileState on the recorded syrupUSDC −3 % run", () => {
  it("shows the classification's outcome at the end", () => {
    const end = stateCounts(saliPositions, replayAt(sali));
    expect(end.stuck).toBe(sali.run.counts.stuck);
    expect(end.safe).toBe(sali.run.counts.safe);
    expect(end["bad-debt"]).toBe(0);
    expect(atEnd(replayAt(sali))).toBe(true);
    expect(atEnd(replayAt(sali, sali.steps))).toBe(true);
  });

  it("starts with nothing hit", () => {
    const counts = stateCounts(saliPositions, replayAt(sali, 0));
    expect(counts.pending).toBe(saliPositions.length);
  });

  it("flips the liquidated position at its first liquidation block (7), not before", () => {
    const p12 = saliPositions.find((p) => p.index === 12) as VizPosition;
    expect(p12.firstLiquidationStep).toBe(7);
    expect(tileState(p12, replayAt(sali, 6))).toBe("pending");
    expect(tileState(p12, replayAt(sali, 7))).toBe("liquidated");
    // Partly liquidated but still under HF 1 at the end: stuck.
    expect(tileState(p12, replayAt(sali))).toBe("stuck");
  });

  it("marks positions below threshold as the oracle price falls through their liquidation price", () => {
    const at13 = stateCounts(saliPositions, replayAt(sali, 13));
    const at19 = stateCounts(saliPositions, replayAt(sali, 19));
    expect(at13.below).toBe(0);
    expect(at19.below).toBeGreaterThan(at13.below);
    // Without prices there is no "below" state.
    expect(stateCounts(saliPositions, { step: 19, steps: sali.steps }).below).toBe(0);
  });

  it("agrees with the chain: every position below threshold at the last block ends stuck or bad debt", () => {
    const last = sali.steps - 1;
    for (const p of saliPositions) {
      if (tileState(p, replayAt(sali, last)) === "below") expect(["stuck", "bad-debt"]).toContain(p.outcome);
    }
  });

  it("lists the states a legend can show at each point", () => {
    expect(visibleStates(replayAt(sali), true)).toEqual(["bad-debt", "stuck", "liquidated", "safe"]);
    expect(visibleStates(replayAt(sali, 3), true)).toEqual(["liquidated", "below", "pending"]);
    expect(visibleStates(replayAt(sali, 3), false)).toEqual(["liquidated", "pending"]);
  });
});

describe("crossing and flip order", () => {
  it("finds the first block whose price is under the liquidation price", () => {
    const p12 = saliPositions.find((p) => p.index === 12) as VizPosition;
    expect(crossingStep(p12, sali.prices)).toBe(7);
    expect(crossingStep(p12, undefined)).toBeNull();
    expect(crossingStep({ liquidationPrice: 0 }, sali.prices)).toBeNull();
  });

  it("staggers positions that flip together, closest first", () => {
    const ordered = byThreshold(saliPositions);
    const replay = replayAt(sali);
    const ranks = flipRanks(ordered, ordered.map((p) => tileState(p, replay)), replay);
    // At the end the 30 stuck positions settle one after another: ranks 0 … 29.
    const stuckRanks = ordered.flatMap((p, i) => (p.outcome === "stuck" ? [ranks[i]] : []));
    expect(stuckRanks).toEqual(Array.from({ length: stuckRanks.length }, (_, i) => i));
  });

  it("measures the current price drop from the block prices", () => {
    expect(dropAt(replayAt(sali, 0))).toBe(0);
    expect(dropAt(replayAt(sali))).toBeCloseTo(sali.shock, 4);
    expect(dropAt(replayAt(worst))).toBeGreaterThan(0.9);
    expect(dropAt({})).toBeNull();
  });

  it("finds the largest debt", () => {
    expect(maxDebt(saliPositions)).toBe(Math.max(...saliPositions.map((p) => p.debtUsd)));
    expect(maxDebt([])).toBe(0);
  });
});
