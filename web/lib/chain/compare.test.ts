import { describe, expect, it } from "vitest";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { fixtureRun } from "./__fixtures__/load";
import { COMPARE_DEBOUNCE_MS, COMPARE_ROWS, THIN_DEPTH_TO_DEBT, compareNotes, compareResultFacts, compareRows, compareScenario } from "./compare";

describe("compare rows", () => {
  it("keep the legacy order; chains derived from the books match the legacy labels (ComparePanel.tsx:10-18)", () => {
    const legacy: [number, "Monad" | "Ethereum", boolean][] = [
      [9, "Monad", false],
      [15, "Ethereum", true],
      [2, "Monad", false],
      [14, "Ethereum", true],
      [13, "Ethereum", true],
      [5, "Monad", true],
      [7, "Ethereum", true],
    ];
    expect(compareRows().map((r) => [r.assetId, r.chain === "monad" ? "Monad" : "Ethereum", r.role !== null])).toEqual(legacy);
    expect(COMPARE_ROWS.map((r) => r.role)).toEqual([
      null,
      "same-maple-loop",
      null,
      "same-asset-deep-pool",
      "deep-liquidity-reference",
      "eth-collateral-stable-debt",
      "same-classic-position",
    ]);
    expect(COMPARE_DEBOUNCE_MS).toBe(900);
  });

  it("row numbers: debt, depth, depth / debt and the thin flag (ComparePanel.tsx:79, 94)", () => {
    const syrup = compareRows()[0];
    const a = DEPLOYMENT.assets[9];
    expect(syrup).toMatchObject({ symbol: "syrupUSDC", debtUsd: a.debtUsd, depthUsd: a.depthUsd, depthIsAssumption: false });
    expect(syrup.depthToDebt).toBe(a.depthUsd / a.debtUsd);
    expect(syrup.thinDepth).toBe(syrup.depthToDebt < THIN_DEPTH_TO_DEBT);
    expect(compareRows()[1].symbol).toBe("syrupUSDT");
  });

  it("scenario: same shock / path on each real book (ComparePanel.tsx:35-41)", () => {
    expect(compareScenario(14, { shockBps: 500, feedback: 0, steps: 20, rounds: 3 })).toEqual({
      assetId: 14,
      shockBps: 500,
      steps: 20,
      maxRoundsPerStep: 3,
      maxPositions: DEPLOYMENT.assets[14].realPositions,
      oracleFeedbackBps: 0,
    });
  });

  it("result facts", () => {
    expect(compareResultFacts(null)).toBeNull();
    expect(compareResultFacts(fixtureRun("sali").result)).toMatchObject({ badDebtUsd: 0, hasBadDebt: false, hasStuckDebt: true });
  });

  it("footnote ratios come from the data (legacy '~48x', '11x', 'hundreds of times')", () => {
    const n = compareNotes();
    expect(Math.round(n.usdeDepthMultiple!)).toBe(48);
    expect(Math.round(n.usdeDebtMultiple!)).toBe(11);
    // the legacy footnote said the USDC pool is "hundreds of times" the debt; the data says ~23.5x
    expect(n.usdcDepthToDebt!).toBeCloseTo(23.52, 1);
  });
});
