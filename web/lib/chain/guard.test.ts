import { encodeFunctionResult, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { fixtureRun } from "./__fixtures__/load";
import {
  BORROW_AMOUNT,
  BORROW_GAS,
  GUARD_POLL_MS,
  GUARD_TX_OVERHEAD_GAS,
  MARKETS,
  guardEffect,
  guardGasFromPreview,
  guardGasLimit,
  guardVerdict,
  readGuardConfig,
  readMarket,
  readMarkets,
} from "./guard";
import type { ChainReader } from "./reader";

const worst = fixtureRun("worst"); // the Guard's own scenario: syrupUSDC -3 %, pool oracle
const guardScenario = { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 10_000 };

describe("guard constants", () => {
  it("keep the legacy tx sizing and poll period (GuardPanel.tsx:17, 94, 112, 126, 147)", () => {
    expect(BORROW_GAS).toBe(80_000n);
    expect(BORROW_AMOUNT).toBe(1_000n * 10n ** 18n);
    expect(GUARD_TX_OVERHEAD_GAS).toBe(150_000n);
    expect(GUARD_POLL_MS).toBe(6_000);
    expect(MARKETS.a).toMatchObject({ address: DEPLOYMENT.contracts.marketA, guarded: false });
    expect(MARKETS.b).toMatchObject({ address: DEPLOYMENT.contracts.marketB, guarded: true });
  });
});

describe("guardVerdict mirrors Guard.refresh() (Guard.sol:58-60)", () => {
  it("trips on bad debt above the threshold, strictly", () => {
    const v = guardVerdict(worst.result, { badDebtThresholdBps: 50, liquidationThresholdBps: 0 });
    const ratio = Number((worst.result.badDebt * 10_000n) / worst.result.totalDebt);
    expect(v).toEqual({ badDebtRatioBps: ratio, liquidationRatioBps: Number((worst.result.totalLiquidated * 10_000n) / worst.result.totalDebt), wouldTrip: true });
    expect(ratio).toBe(9_371);
    expect(guardVerdict(worst.result, { badDebtThresholdBps: ratio, liquidationThresholdBps: 0 }).wouldTrip).toBe(false);
  });

  it("uses the liquidation threshold only when set", () => {
    const sali = fixtureRun("sali").result; // no bad debt, a little liquidated
    expect(guardVerdict(sali, { badDebtThresholdBps: 50, liquidationThresholdBps: 0 }).wouldTrip).toBe(false);
    expect(guardVerdict(sali, { badDebtThresholdBps: 50, liquidationThresholdBps: 1 }).wouldTrip).toBe(true); // 10 bps liquidated
    expect(guardVerdict({ ...sali, totalDebt: 0n }, { badDebtThresholdBps: 0, liquidationThresholdBps: 0 })).toEqual({ badDebtRatioBps: 0, liquidationRatioBps: 0, wouldTrip: false });
  });

  it("a trip pauses the market and lowers max LTV only if higher (Guard.sol:63-65)", () => {
    expect(guardEffect({ safeLtvBps: 7_000 }, { paused: false, maxLtvBps: 9_000, borrowed: 0n })).toEqual({ paused: true, maxLtvBps: 7_000 });
    expect(guardEffect({ safeLtvBps: 7_000 }, { paused: false, maxLtvBps: 6_000, borrowed: 0n })).toEqual({ paused: true, maxLtvBps: 6_000 });
  });
});

describe("guard reads", () => {
  const readContract = vi.fn(async (req: { address: string; functionName: string }) => {
    const byFn: Record<string, unknown> = {
      scenario: guardScenario,
      badDebtThresholdBps: 50,
      liquidationThresholdBps: 0,
      safeLtvBps: 7_000,
      engine: DEPLOYMENT.contracts.kaskad,
      market: DEPLOYMENT.contracts.marketB,
      borrowPaused: req.address === DEPLOYMENT.contracts.marketB,
      maxLtvBps: req.address === DEPLOYMENT.contracts.marketB ? 7_000 : 9_000,
      totalBorrowed: 3_000n * 10n ** 18n,
    };
    return byFn[req.functionName];
  });
  const call = vi.fn<(a: { to: string; data: Hex; gas: bigint }) => Promise<{ data: Hex }>>(async () => ({
    data: encodeFunctionResult({ abi: kaskadAbi, functionName: "preview", result: worst.result }),
  }));
  const reader = { readContract, call } as unknown as ChainReader;

  it("readMarket / readMarkets (GuardPanel.tsx:19-27)", async () => {
    expect(await readMarket(DEPLOYMENT.contracts.marketA, reader)).toEqual({ paused: false, maxLtvBps: 9_000, borrowed: 3_000n * 10n ** 18n });
    const both = await readMarkets(reader);
    expect(both.b).toEqual({ paused: true, maxLtvBps: 7_000, borrowed: 3_000n * 10n ** 18n });
  });

  it("readGuardConfig replaces the hard-coded threshold / LTV copy with live reads", async () => {
    expect(await readGuardConfig(reader)).toEqual({
      address: DEPLOYMENT.contracts.guard,
      scenario: guardScenario,
      badDebtThresholdBps: 50,
      liquidationThresholdBps: 0,
      safeLtvBps: 7_000,
      engine: DEPLOYMENT.contracts.kaskad,
      market: DEPLOYMENT.contracts.marketB,
    });
  });

  it("guardGasLimit: scenario -> preview on engineFor -> simulateGasLimit + 150k (GuardPanel.tsx:88-100)", async () => {
    call.mockClear();
    const gas = await guardGasLimit({ reader });
    expect(gas).toBe(simulateGasLimit(worst.result.gasUsed, worst.result.rounds) + 150_000n);
    expect(gas).toBe(guardGasFromPreview(worst.result));
    expect(call.mock.calls[0][0]).toMatchObject({ to: DEPLOYMENT.contracts.kaskadMC, gas: 30_000_000n });
  });
});
