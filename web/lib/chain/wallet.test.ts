import { describe, expect, it, vi } from "vitest";
import type { UserPosition } from "@/lib/kaskad/aave";
import { wadToNum } from "@/lib/kaskad/format";
import { collateralToSurvive, depegToLiquidation, repayToSurvive } from "@/lib/kaskad/math";
import { fixtureRun } from "./__fixtures__/load";
import {
  HEADLINE_CASCADE,
  SAMPLES,
  SURVIVE_HF_TARGET,
  cascadeFor,
  fetchPosition,
  surviveSuggestions,
  walletCascadeScenario,
  walletRisk,
} from "./wallet";

const line = (over: Partial<UserPosition["reserves"][number]>): UserPosition["reserves"][number] => ({
  id: 9,
  symbol: "syrupUSDC",
  suppliedUsd: 0,
  borrowedUsd: 0,
  isCollateral: false,
  ltBps: 9_200,
  bonusBps: 400,
  utilization: 0,
  reserveSuppliedUsd: 138_000_000,
  ...over,
});

const syrup = line({ suppliedUsd: 1_000_000, isCollateral: true });
const usdc = line({ id: 1, symbol: "USDC", suppliedUsd: 50_000, utilization: 0.95 });
const usdt = line({ id: 0, symbol: "USDT0", suppliedUsd: 20_000, utilization: 0.5 });
const dust = line({ id: 2, symbol: "USDe", suppliedUsd: 0.5 });
const position: UserPosition = {
  address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748",
  block: 1,
  eMode: 1,
  hfOnchain: 1.02,
  collateralUsd: 1_070_000,
  debtUsd: 900_000,
  reserves: [syrup, usdc, usdt, dust],
  dominant: syrup,
  otherLtAdjustedUsd: 10_000,
  protocol: { suppliedUsd: 530_000_000, debtUsd: 238_000_000 },
};

describe("wallet cascade", () => {
  it("uses the legacy real-book scenario (Wallet.tsx:21-32)", () => {
    expect(walletCascadeScenario(9)).toEqual({ assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 0 });
    expect(walletCascadeScenario(HEADLINE_CASCADE.assetId, HEADLINE_CASCADE.shockBps)?.shockBps).toBe(2_000);
    expect(walletCascadeScenario(3)).toBeNull();
  });

  it("cascadeFor: null for unknown assets or failures, like the legacy .catch(() => null)", async () => {
    const call = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await cascadeFor(9, 300, { reader: { call } as never })).toBeNull();
    expect(await cascadeFor(3, 300, { reader: { call } as never })).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("keeps the two sample borrowers (Wallet.tsx:15-18)", () => {
    expect(SAMPLES.map((s) => s.address)).toEqual(["0x815f5BB257e88b67216a344C7C83a3eA4EE74748", "0x278AA16c5C8E1D68938A302e809F126863D81dAA"]);
    expect(SAMPLES.map((s) => s.assetId)).toEqual([9, 12]);
  });
});

describe("walletRisk (identical math to Wallet.tsx:88-96)", () => {
  const cascade = fixtureRun("sali").result;
  const headline = fixtureRun("worst").result; // any result with bad debt

  it("borrow side", () => {
    const r = walletRisk(position, cascade, headline);
    const threshold = depegToLiquidation(syrup.suppliedUsd, position.otherLtAdjustedUsd, syrup.ltBps, position.debtUsd);
    const drop = 1 - wadToNum(cascade.finalPrice) / wadToNum(cascade.startPrice);
    expect(r.borrower).toBe(true);
    expect(r.threshold).toBe(threshold);
    expect(r.thresholdState).toEqual({ kind: "at-drop", drop: threshold });
    expect(r.cascadeDrop).toBe(drop);
    expect(r.liquidatedInCascade).toBe(threshold < drop);
    expect(r.hfDanger).toBe(true); // 1.02 < 1.05
    expect(r.cascadeStuckDebtUsd).toBe(wadToNum(cascade.stuckDebt));
  });

  it("supply side: dust filtered, withdrawal states, loss share of the headline bad debt", () => {
    const r = walletRisk(position, cascade, headline);
    expect(r.supplied.map((s) => [s.symbol, s.withdraw])).toEqual([
      ["syrupUSDC", "collateral-only"],
      ["USDC", "at-risk"],
      ["USDT0", "withdrawable"],
    ]);
    expect(r.supplied[1].liquidityShare).toBeCloseTo(0.05, 12);
    expect(r.lentUsd).toBe(70_000);
    expect(r.lossShareUsd).toBe((70_000 / Math.max(1, 530_000_000)) * wadToNum(headline.badDebt));
    expect(walletRisk(position, cascade, null).lossShareUsd).toBe(0);
  });

  it("threshold states: liquidatable now, never, no debt", () => {
    const now = walletRisk({ ...position, debtUsd: 2_000_000 }, null, null);
    expect(now.thresholdState).toEqual({ kind: "liquidatable-now" });
    const never = walletRisk({ ...position, otherLtAdjustedUsd: 5_000_000 }, null, null);
    expect(never.thresholdState).toEqual({ kind: "never" });
    const none = walletRisk({ ...position, debtUsd: 0.5 }, null, null);
    expect(none).toMatchObject({ borrower: false, threshold: null, thresholdState: null, liquidatedInCascade: null });
  });

  it("survive suggestions use math.ts's default HF target", () => {
    const s = surviveSuggestions(position, 5)!;
    expect(s.addCollateralUsd).toBe(collateralToSurvive(1_000_000, 10_000, 9_200, 900_000, 0.05));
    expect(s.repayUsd).toBe(repayToSurvive(1_000_000, 10_000, 9_200, 900_000, 0.05));
    expect(SURVIVE_HF_TARGET).toBe(1.05);
    expect(surviveSuggestions({ ...position, dominant: null }, 5)).toBeNull();
  });
});

describe("fetchPosition (GET /api/position)", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("validates the address before any request", async () => {
    const f = vi.fn();
    expect(await fetchPosition("0x123", f)).toEqual({ ok: false, error: { code: "invalid-address" } });
    expect(f).not.toHaveBeenCalled();
  });

  it("returns the position, or a typed error by status", async () => {
    const addr = position.address;
    const ok = vi.fn(async () => json(200, position));
    expect(await fetchPosition(addr, ok)).toEqual({ ok: true, position });
    expect(ok).toHaveBeenCalledWith(`/api/position?address=${addr}`);
    for (const [status, code] of [
      [400, "invalid-address"],
      [429, "rate-limited"],
      [503, "unconfigured"],
      [502, "upstream"],
      [500, "failed"],
    ] as const) {
      const res = await fetchPosition(addr, async () => json(status, { error: "x" }));
      expect(res).toEqual({ ok: false, error: { code, status, raw: "x" } });
    }
    expect(await fetchPosition(addr, async () => new Response("not json", { status: 200 }))).toMatchObject({ ok: false, error: { code: "failed" } });
    expect(
      await fetchPosition(addr, async () => {
        throw new Error("offline");
      }),
    ).toEqual({ ok: false, error: { code: "failed", raw: "offline" } });
  });
});
