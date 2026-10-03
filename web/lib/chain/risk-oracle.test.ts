import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RISK } from "@/lib/kaskad/config";
import type { ChainReader } from "./reader";
import {
  assetStatus,
  nextPublishAt,
  PUBLISH_OVERHEAD_GAS,
  publishGasFromPreviews,
  publishGasLimit,
  readRiskSystem,
  RISK_SHOCKS_BPS,
  triggerReport,
  type RiskAsset,
  type RiskRule,
} from "./risk-oracle";

const WAD = 10n ** 18n;
// What DeployRisk.s.sol sets for both assets.
const rule: RiskRule = {
  enabled: true,
  steps: 20,
  rounds: 3,
  maxPositions: 0,
  oracleFeedbackBps: 0,
  triggerShockBps: 1_000,
  lossThresholdBps: 100,
  stuckThresholdBps: 2_000,
  ltvFloorBps: 7_000,
  ltvCeilingBps: 9_000,
  ltvStepBps: 500,
  minInterval: 600,
};
const T = 1_791_042_926;
// syrupUSDC after the first demo run (broadcast/DemoRisk.s.sol), in $.
const syrup: Record<number, [bad: bigint, stuck: bigint, hidden: bigint]> = {
  100: [0n, 0n, 0n],
  300: [0n, 110_987_638n, 255_394n],
  1_000: [17_749n, 96_777_238n, 8_817_433n],
  2_000: [13_254_245n, 80_442n, 8_317_544n],
};

const report = (assetId: number, shock: number) => {
  const [bad, stuck, hidden] = assetId === 9 ? syrup[shock] : [0n, 0n, 0n];
  return {
    publishedAt: BigInt(T),
    blockNumber: 67_870_361n,
    positions: assetId === 9 ? 57 : 42,
    totalDebt: 123_685_701n * WAD,
    badDebt: bad * WAD,
    stuckDebt: stuck * WAD,
    hiddenBadDebt: hidden * WAD,
    liquidated: 0n,
    oraclePrice: WAD,
    spotPrice: WAD,
  };
};

type Call = { address: string; functionName: string; args?: readonly unknown[] };

function answer(c: Call): unknown {
  const market = c.address === RISK.marketSyrupUSDC ? "syrup" : c.address === RISK.marketWETH ? "weth" : null;
  switch (c.functionName) {
    case "name":
      return market === "syrup" ? "kUSD / syrupUSDC" : "kUSD / WETH";
    case "collateralAssetId":
      return market === "syrup" ? 9 : 5;
    case "borrowPaused":
      return market === "syrup";
    case "maxLtvBps":
      return market === "syrup" ? 8_500 : 9_000;
    case "deposits":
      return market === "syrup" ? 0n : 1_000_000n * 10n ** 6n;
    case "flagged":
      return c.args?.[0] === RISK.marketSyrupUSDC;
    case "totalAssets":
      return 1_000_000n * 10n ** 6n;
    case "balanceOf":
      return 0n;
    case "maxReportAge":
      return 86_400;
    case "recoveryDelay":
      return 1_800;
    case "rule":
      return rule;
    case "state":
      return c.args?.[0] === 9n ? [true, 8_500, BigInt(T), 714, 7_824] : [false, 9_000, BigInt(T + 2), 0, 0];
    case "latest":
      return report(c.args?.[0] as number, c.args?.[1] as number);
    case "bookStats":
      return [0n, 0n, 0n, c.args?.[0] === 9n ? 57 : 42];
    case "previewWithHidden": {
      const s = c.args?.[0] as { shockBps: number; maxPositions: number };
      return [{ gasUsed: BigInt(s.maxPositions) * 1_000n + BigInt(s.shockBps) }, {}];
    }
  }
  throw new Error(`unexpected ${c.functionName}`);
}

function stubReader(opts: { multicall?: boolean } = {}) {
  const readContract = vi.fn(async (c: Call) => answer(c));
  const multicall = vi.fn(async (req: { contracts: Call[] }) => {
    if (opts.multicall === false) throw new Error("multicall3 not deployed");
    return req.contracts.map(answer);
  });
  return { readContract, multicall, reader: { readContract, multicall } as unknown as ChainReader };
}

const asset = (over: Partial<RiskAsset> = {}): RiskAsset => ({
  assetId: 9,
  rule,
  state: { atRisk: true, recommendedLtvBps: 8_500, lastPublished: T, lossBps: 714, stuckBps: 7_824 },
  reports: [],
  bookPositions: 57,
  ...over,
});

describe("RISK deployment", () => {
  it("is the copy of contracts/deployments/risk-testnet.json", () => {
    const src = JSON.parse(readFileSync(join(__dirname, "../../../contracts/deployments/risk-testnet.json"), "utf8"));
    expect(RISK).toEqual(src);
  });
});

describe("readRiskSystem", () => {
  it("reads markets, vault and both assets in two multicalls", async () => {
    const { reader, multicall, readContract } = stubReader();
    const s = await readRiskSystem(reader);
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(readContract).not.toHaveBeenCalled();
    expect(s.markets).toEqual([
      { address: RISK.marketSyrupUSDC, name: "kUSD / syrupUSDC", assetId: 9, paused: true, maxLtvBps: 8_500, vaultDeposit: 0n, flagged: true },
      { address: RISK.marketWETH, name: "kUSD / WETH", assetId: 5, paused: false, maxLtvBps: 9_000, vaultDeposit: 10n ** 12n, flagged: false },
    ]);
    expect(s.vault).toEqual({ totalAssets: 10n ** 12n, idle: 0n, maxReportAge: 86_400 });
    expect(s.guard).toEqual({ maxReportAge: 86_400, recoveryDelay: 1_800 });

    const [a9, a5] = s.assets;
    expect(a9).toMatchObject({ assetId: 9, rule, bookPositions: 57 });
    expect(a9.state).toEqual({ atRisk: true, recommendedLtvBps: 8_500, lastPublished: T, lossBps: 714, stuckBps: 7_824 });
    expect(a9.reports.map((r) => r.shockBps)).toEqual([...RISK_SHOCKS_BPS]);
    expect(triggerReport(a9)).toMatchObject({ shockBps: 1_000, badDebt: 17_749n * WAD, stuckDebt: 96_777_238n * WAD, hiddenBadDebt: 8_817_433n * WAD });
    expect(a5).toMatchObject({ assetId: 5, bookPositions: 42, state: { atRisk: false, recommendedLtvBps: 9_000 } });
  });

  it("falls back to plain reads without Multicall3", async () => {
    const { reader, readContract } = stubReader({ multicall: false });
    const s = await readRiskSystem(reader);
    expect(s.markets[0].paused).toBe(true);
    expect(s.assets[0].reports[2].hiddenBadDebt).toBe(8_817_433n * WAD);
    expect(readContract).toHaveBeenCalledTimes(17 + 2 * 7);
  });
});

describe("publish gas", () => {
  it("is the four previews +15 % plus the storage overhead, capped at 30M", () => {
    expect(publishGasFromPreviews([334_080n, 404_341n, 433_604n, 435_349n])).toBe((1_607_374n * 115n) / 100n + PUBLISH_OVERHEAD_GAS);
    expect(publishGasFromPreviews([40_000_000n])).toBe(30_000_000n);
  });

  it("previews the whole book when maxPositions is 0, otherwise the rule's resolution", async () => {
    const { reader, multicall } = stubReader();
    await publishGasLimit(asset(), reader);
    const scenarios = multicall.mock.calls[0][0].contracts.map((c) => c.args?.[0] as { maxPositions: number; shockBps: number });
    expect(scenarios.map((s) => s.maxPositions)).toEqual([57, 57, 57, 57]);
    expect(scenarios.map((s) => s.shockBps)).toEqual([...RISK_SHOCKS_BPS]);

    multicall.mockClear();
    await publishGasLimit(asset({ rule: { ...rule, maxPositions: 20 } }), reader);
    expect(multicall.mock.calls[0][0].contracts.map((c) => (c.args?.[0] as { maxPositions: number }).maxPositions)).toEqual([20, 20, 20, 20]);
  });
});

describe("decisions mirrored from the contracts", () => {
  it("nextPublishAt: lastPublished + minInterval, 0 before the first publish (RiskOracle.sol:114)", () => {
    expect(nextPublishAt(asset())).toBe(T + 600);
    expect(nextPublishAt(asset({ state: { ...asset().state, lastPublished: 0 } }))).toBe(0);
  });

  it("assetStatus: none, stale past maxReportAge (GuardV2.sol:54), else at risk / clear", () => {
    expect(assetStatus(asset({ state: { ...asset().state, lastPublished: 0 } }), T, 86_400)).toBe("none");
    expect(assetStatus(asset(), T + 86_400, 86_400)).toBe("at-risk");
    expect(assetStatus(asset(), T + 86_401, 86_400)).toBe("stale");
    expect(assetStatus(asset({ state: { ...asset().state, atRisk: false } }), T + 60, 86_400)).toBe("clear");
  });

  it("triggerReport is null before the first publish", () => {
    const empty = { ...report(9, 1_000), shockBps: 1_000, publishedAt: 0 };
    expect(triggerReport(asset({ reports: [empty] }))).toBeNull();
  });
});
