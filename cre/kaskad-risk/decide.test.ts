import { describe, expect, test } from "bun:test";
import { type AssetView, decideAsset, guardLags, type MarketView, plan, REASON, reportGasLimit, vaultLags, verdict } from "./decide";

const WAD = 10n ** 18n;
const T = 1_791_042_926;
const rule = { enabled: true, triggerShockBps: 1_000, lossThresholdBps: 100, stuckThresholdBps: 2_000, minInterval: 600 };
// syrupUSDC at -10% on testnet (the first demo run): $17.7K bad, $96.8M stuck, $8.8M hidden of $123.7M.
const syrupPreview = { totalDebt: 123_685_701n * WAD, badDebt: 17_749n * WAD, stuckDebt: 96_777_238n * WAD, hiddenBadDebt: 8_817_433n * WAD };
const calm = { totalDebt: 1_000_000n * WAD, badDebt: 0n, stuckDebt: 0n, hiddenBadDebt: 0n };

const asset = (over: Partial<AssetView> = {}): AssetView => ({
  assetId: 9,
  rule,
  state: { atRisk: true, recommendedLtvBps: 8_500, lastPublished: T },
  preview: syrupPreview,
  ...over,
});
const market = (over: Partial<MarketView> = {}): MarketView => ({
  address: "0x80E3c0a78E86686CA6309A3CAdA587c2DCf45074",
  assetId: 9,
  paused: true,
  lastAtRisk: T,
  flagged: true,
  vaultDeposit: 0n,
  ...over,
});

describe("verdict mirrors RiskOracle.publish()", () => {
  test("syrupUSDC -10%: the numbers the oracle stored on testnet (lossBps 714, stuckBps 7824)", () => {
    expect(verdict(syrupPreview, rule)).toEqual({ atRisk: true, lossBps: 714, stuckBps: 7_824 });
  });

  test("strict thresholds; stuck 0 disables the stuck rule; empty book is clear", () => {
    const at = (bad: bigint, stuck: bigint) => ({ totalDebt: 10_000n * WAD, badDebt: bad * WAD, stuckDebt: stuck * WAD, hiddenBadDebt: 0n });
    expect(verdict(at(100n, 0n), rule).atRisk).toBe(false); // exactly 1%
    expect(verdict(at(101n, 0n), rule).atRisk).toBe(true);
    expect(verdict(at(0n, 2_001n), rule).atRisk).toBe(true);
    expect(verdict(at(0n, 9_000n), { ...rule, stuckThresholdBps: 0 }).atRisk).toBe(false);
    expect(verdict({ totalDebt: 0n, badDebt: 0n, stuckDebt: 0n, hiddenBadDebt: 0n }, rule)).toEqual({ atRisk: false, lossBps: 0, stuckBps: 0 });
  });
});

describe("decideAsset", () => {
  test("steady: the preview agrees with the stored verdict and the report is fresh", () => {
    expect(decideAsset(asset(), T + 3_600, 21_600, false)).toMatchObject({ publish: false, why: "steady" });
  });

  test("first report, flip, stale and book change each publish", () => {
    expect(decideAsset(asset({ state: { atRisk: false, recommendedLtvBps: 9_000, lastPublished: 0 } }), T, 21_600, false)).toMatchObject({ publish: true, why: REASON.first });
    expect(decideAsset(asset({ preview: calm }), T + 3_600, 21_600, false)).toMatchObject({ publish: true, why: REASON.flip });
    expect(decideAsset(asset(), T + 21_600, 21_600, false)).toMatchObject({ publish: true, why: REASON.stale });
    expect(decideAsset(asset(), T + 3_600, 21_600, true)).toMatchObject({ publish: true, why: REASON.bookChanged });
  });

  test("never inside the oracle's cooldown (publish would revert TooSoon)", () => {
    expect(decideAsset(asset({ preview: calm }), T + 599, 21_600, false)).toMatchObject({ publish: false, why: "cooldown", cooldownLeft: 1 });
    expect(decideAsset(asset({ preview: calm }), T + 600, 21_600, false)).toMatchObject({ publish: true, cooldownLeft: 0 });
  });

  test("a disabled rule is never published", () => {
    expect(decideAsset(asset({ rule: { ...rule, enabled: false } }), T, 21_600, true)).toMatchObject({ publish: false, why: "disabled" });
  });
});

describe("guard and vault lag", () => {
  test("GuardV2 pauses an open market at risk; reopens a paused one only after the recovery delay", () => {
    expect(guardLags(market({ paused: false }), true, T, 1_800)).toBe(true);
    expect(guardLags(market(), true, T, 1_800)).toBe(false);
    expect(guardLags(market(), false, T + 1_799, 1_800)).toBe(false);
    expect(guardLags(market(), false, T + 1_800, 1_800)).toBe(true);
    expect(guardLags(market({ paused: false }), false, T, 1_800)).toBe(false);
  });

  test("RiskVault moves money out of a flagged market, or idle money into an open one", () => {
    expect(vaultLags([market({ vaultDeposit: 5n })], 0n)).toBe(true);
    expect(vaultLags([market(), market({ flagged: false, vaultDeposit: 10n })], 0n)).toBe(false);
    expect(vaultLags([market(), market({ flagged: false })], 1n)).toBe(true);
    expect(vaultLags([market()], 1n)).toBe(false); // nowhere to put it
  });
});

describe("plan", () => {
  const weth = asset({ assetId: 5, state: { atRisk: false, recommendedLtvBps: 9_000, lastPublished: T }, preview: calm });
  const wethMarket = market({ address: "0x03AC872EF1A2a77ECa869A0F8aC7c9b9F9727842", assetId: 5, paused: false, flagged: false, vaultDeposit: 10n ** 12n });
  const base = { markets: [market(), wethMarket], vaultIdle: 0n, recoveryDelay: 1_800, refreshAfter: 21_600 };

  test("the testnet state after the demo run is steady: no report", () => {
    expect(plan({ ...base, assets: [asset(), weth], nowSec: T + 3_600 })).toMatchObject({ publish: [], refreshGuard: false, rebalanceVault: false, reason: REASON.none });
  });

  test("a recovering asset: publish it, then let the guard and the vault follow", () => {
    const p = plan({ ...base, assets: [asset({ preview: calm }), weth], nowSec: T + 3_600 });
    expect(p).toMatchObject({ publish: [9], refreshGuard: true, rebalanceVault: true, reason: REASON.flip });
  });

  test("sync only: the oracle is right but the guard lags", () => {
    const p = plan({ ...base, assets: [asset(), weth], markets: [market({ paused: false }), wethMarket], nowSec: T + 3_600 });
    expect(p).toMatchObject({ publish: [], refreshGuard: true, rebalanceVault: false, reason: REASON.sync });
  });

  test("a log trigger re-publishes only the changed asset", () => {
    const p = plan({ ...base, assets: [asset(), weth], nowSec: T + 3_600, changed: new Set([5]) });
    expect(p).toMatchObject({ publish: [5], reason: REASON.bookChanged });
  });

  test("gas limit follows what the report runs", () => {
    const g = { base: 500_000n, perPublish: 2_300_000n, guard: 250_000n, vault: 350_000n };
    expect(reportGasLimit({ publish: [9, 5], refreshGuard: true, rebalanceVault: true }, g)).toBe(5_700_000n);
    expect(reportGasLimit({ publish: [], refreshGuard: true, rebalanceVault: false }, g)).toBe(750_000n);
  });
});
