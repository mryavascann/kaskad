// RiskOracle -> GuardV2 -> RiskVault (A6, contracts/src/RiskOracle.sol, GuardV2.sol, RiskVault.sol).
// One read of the whole system for the Guard page, the gas limits of its three public calls, and the
// pure decisions the contracts make, mirrored for the copy.

import { erc20Abi, type Address } from "viem";
import { kaskadAbi, kaskadMCv3Abi, mockMarketV2Abi, riskOracleAbi, guardV2Abi, riskVaultAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT, RISK } from "@/lib/kaskad/config";
import { MONAD_TX_GAS_LIMIT } from "@/lib/kaskad/math";
import type { ChainReader } from "./reader";

/** RiskOracle.shocks() (RiskOracle.sol:77): fixed, so the page does not read it. */
export const RISK_SHOCKS_BPS = [100, 300, 1_000, 2_000] as const;
/** The two demo markets, in the order GuardV2 and RiskVault list them. */
export const RISK_MARKETS: readonly Address[] = [RISK.marketSyrupUSDC, RISK.marketWETH];
/** System refresh period while the tab is visible (~26 calls in two JSON-RPC batches). */
export const RISK_POLL_MS = 20_000;
/** GuardV2.refresh() over two markets used 156k (broadcast/DemoRisk.s.sol); Monad charges the limit. */
export const GUARD_V2_REFRESH_GAS = 300_000n;
/** RiskVault.rebalance() moving between two markets used 224k. */
export const VAULT_REBALANCE_GAS = 400_000n;
/** publish() overhead on top of its four previews: 4 reports stored, 5 events (measured 257-311k). */
export const PUBLISH_OVERHEAD_GAS = 400_000n;

export type RiskRule = {
  enabled: boolean;
  steps: number;
  rounds: number;
  /** 0 = the whole book. */
  maxPositions: number;
  oracleFeedbackBps: number;
  triggerShockBps: number;
  lossThresholdBps: number;
  stuckThresholdBps: number;
  ltvFloorBps: number;
  ltvCeilingBps: number;
  ltvStepBps: number;
  /** Seconds between two publishes of the same asset. */
  minInterval: number;
};

/** One stored shock (RiskOracle.Report). USD amounts and prices are WAD bigints; publishedAt 0 = none yet. */
export type RiskReport = {
  shockBps: number;
  publishedAt: number;
  blockNumber: bigint;
  positions: number;
  totalDebt: bigint;
  badDebt: bigint;
  stuckDebt: bigint;
  hiddenBadDebt: bigint;
  liquidated: bigint;
  oraclePrice: bigint;
  spotPrice: bigint;
};

export type RiskState = {
  atRisk: boolean;
  recommendedLtvBps: number;
  /** Unix seconds, 0 = never published. */
  lastPublished: number;
  /** (bad + hidden bad debt) / debt of the trigger shock. */
  lossBps: number;
  stuckBps: number;
};

export type RiskAsset = {
  assetId: number;
  rule: RiskRule;
  state: RiskState;
  reports: RiskReport[];
  /** Live Kaskad bookStats(asset).count: what maxPositions 0 resolves to. */
  bookPositions: number;
};

export type RiskMarket = {
  address: Address;
  name: string;
  assetId: number;
  paused: boolean;
  maxLtvBps: number;
  /** What RiskVault has deposited in this market (kUSD, 6 decimals). */
  vaultDeposit: bigint;
  /** RiskVault.flagged(): at risk or no fresh report, the vault keeps out. */
  flagged: boolean;
};

export type RiskSystem = {
  assets: RiskAsset[];
  markets: RiskMarket[];
  /** kUSD, 6 decimals. */
  vault: { totalAssets: bigint; idle: bigint; maxReportAge: number };
  guard: { maxReportAge: number; recoveryDelay: number };
};

export type AssetStatus = "none" | "stale" | "at-risk" | "clear";

const loadReader = async (reader?: ChainReader): Promise<ChainReader> => reader ?? (await import("./reader")).defaultReader();

/** Fallback without Multicall3: plain reads, at most this many per JSON-RPC batch. */
const PLAIN_READ_CHUNK = 10;

type Read = Parameters<ChainReader["readContract"]>[0];

/**
 * All reads in one Multicall3 eth_call (the public RPC counts every call of a JSON-RPC batch against
 * its 15/s limit); without Multicall3 (a local chain), plain reads in small sequential batches.
 */
async function readAll(reader: ChainReader, calls: readonly Read[]): Promise<unknown[]> {
  try {
    return (await reader.multicall({ contracts: calls as never, allowFailure: false })) as unknown[];
  } catch {
    const out: unknown[] = [];
    for (let i = 0; i < calls.length; i += PLAIN_READ_CHUNK) {
      out.push(...(await Promise.all(calls.slice(i, i + PLAIN_READ_CHUNK).map((c) => reader.readContract(c)))));
    }
    return out;
  }
}

const MARKET_READS = 6;

/** Everything the page shows: two eth_calls (markets and vault, then the markets' assets). */
export async function readRiskSystem(r?: ChainReader): Promise<RiskSystem> {
  const reader = await loadReader(r);
  const vault = RISK.riskVault;
  const calls: Read[] = RISK_MARKETS.flatMap((address): Read[] => [
    { address, abi: mockMarketV2Abi, functionName: "name" },
    { address, abi: mockMarketV2Abi, functionName: "collateralAssetId" },
    { address, abi: mockMarketV2Abi, functionName: "borrowPaused" },
    { address, abi: mockMarketV2Abi, functionName: "maxLtvBps" },
    { address, abi: mockMarketV2Abi, functionName: "deposits", args: [vault] },
    { address: vault, abi: riskVaultAbi, functionName: "flagged", args: [address] },
  ]);
  calls.push(
    { address: vault, abi: riskVaultAbi, functionName: "totalAssets" },
    { address: RISK.kUSD, abi: erc20Abi, functionName: "balanceOf", args: [vault] },
    { address: vault, abi: riskVaultAbi, functionName: "maxReportAge" },
    { address: RISK.guardV2, abi: guardV2Abi, functionName: "maxReportAge" },
    { address: RISK.guardV2, abi: guardV2Abi, functionName: "recoveryDelay" },
  );
  const res = await readAll(reader, calls);
  const markets: RiskMarket[] = RISK_MARKETS.map((address, i) => {
    const [name, assetId, paused, ltv, vaultDeposit, flagged] = res.slice(i * MARKET_READS, (i + 1) * MARKET_READS);
    return {
      address,
      name: name as string,
      assetId: Number(assetId),
      paused: paused as boolean,
      maxLtvBps: Number(ltv),
      vaultDeposit: vaultDeposit as bigint,
      flagged: flagged as boolean,
    };
  });
  const [totalAssets, idle, vaultAge, guardAge, recoveryDelay] = res.slice(RISK_MARKETS.length * MARKET_READS);

  const ids = [...new Set(markets.map((m) => m.assetId))];
  return {
    assets: await readRiskAssets(ids, reader),
    markets,
    vault: { totalAssets: totalAssets as bigint, idle: idle as bigint, maxReportAge: Number(vaultAge) },
    guard: { maxReportAge: Number(guardAge), recoveryDelay: Number(recoveryDelay) },
  };
}

type RuleOut = RiskRule;
type ReportOut = Omit<RiskReport, "shockBps" | "publishedAt"> & { publishedAt: bigint };
const ASSET_READS = 3 + RISK_SHOCKS_BPS.length;

/** Rule, state, the four stored reports and the book size of each asset, in one eth_call. */
export async function readRiskAssets(assetIds: readonly number[], r?: ChainReader): Promise<RiskAsset[]> {
  const reader = await loadReader(r);
  const address = RISK.riskOracle;
  const calls = assetIds.flatMap((assetId): Read[] => [
    { address, abi: riskOracleAbi, functionName: "rule", args: [assetId] },
    { address, abi: riskOracleAbi, functionName: "state", args: [BigInt(assetId)] },
    ...RISK_SHOCKS_BPS.map((s): Read => ({ address, abi: riskOracleAbi, functionName: "latest", args: [assetId, s] })),
    { address: DEPLOYMENT.contracts.kaskad, abi: kaskadAbi, functionName: "bookStats", args: [BigInt(assetId)] },
  ]);
  const res = await readAll(reader, calls);
  return assetIds.map((assetId, k) => {
    const row = res.slice(k * ASSET_READS, (k + 1) * ASSET_READS);
    const [rule, state] = row as [RuleOut, readonly [boolean, number, bigint, number, number]];
    const reports = row.slice(2, 2 + RISK_SHOCKS_BPS.length) as ReportOut[];
    const stats = row[ASSET_READS - 1] as readonly [bigint, bigint, bigint, number];
    const [atRisk, recommendedLtvBps, lastPublished, lossBps, stuckBps] = state;
    return {
      assetId,
      rule: {
        enabled: rule.enabled,
        steps: rule.steps,
        rounds: rule.rounds,
        maxPositions: rule.maxPositions,
        oracleFeedbackBps: rule.oracleFeedbackBps,
        triggerShockBps: rule.triggerShockBps,
        lossThresholdBps: rule.lossThresholdBps,
        stuckThresholdBps: rule.stuckThresholdBps,
        ltvFloorBps: rule.ltvFloorBps,
        ltvCeilingBps: rule.ltvCeilingBps,
        ltvStepBps: rule.ltvStepBps,
        minInterval: rule.minInterval,
      },
      state: { atRisk, recommendedLtvBps, lastPublished: Number(lastPublished), lossBps, stuckBps },
      reports: reports.map((p, i) => ({
        shockBps: RISK_SHOCKS_BPS[i],
        publishedAt: Number(p.publishedAt),
        blockNumber: p.blockNumber,
        positions: p.positions,
        totalDebt: p.totalDebt,
        badDebt: p.badDebt,
        stuckDebt: p.stuckDebt,
        hiddenBadDebt: p.hiddenBadDebt,
        liquidated: p.liquidated,
        oraclePrice: p.oraclePrice,
        spotPrice: p.spotPrice,
      })),
      bookPositions: Number(stats[3]),
    };
  });
}

/**
 * publish() gas limit: the four previews publish() runs (free, on KaskadMCv3, the same scenarios),
 * +15 % and the storage / event overhead. One eth_call.
 */
export async function publishGasLimit(asset: Pick<RiskAsset, "assetId" | "rule" | "bookPositions">, r?: ChainReader): Promise<bigint> {
  const reader = await loadReader(r);
  const { rule, assetId } = asset;
  const n = rule.maxPositions === 0 ? asset.bookPositions : rule.maxPositions;
  const previews = (await readAll(
    reader,
    RISK_SHOCKS_BPS.map(
      (shockBps): Read => ({
        address: RISK.kaskadMCv3,
        abi: kaskadMCv3Abi,
        functionName: "previewWithHidden",
        args: [{ assetId, shockBps, steps: rule.steps, maxRoundsPerStep: rule.rounds, maxPositions: n, oracleFeedbackBps: rule.oracleFeedbackBps }],
      }),
    ),
  )) as [{ gasUsed: bigint }, unknown][];
  return publishGasFromPreviews(previews.map(([res]) => res.gasUsed));
}

export function publishGasFromPreviews(gasUsed: readonly bigint[]): bigint {
  const sum = gasUsed.reduce((a, b) => a + b, 0n);
  const limit = (sum * 115n) / 100n + PUBLISH_OVERHEAD_GAS;
  const cap = BigInt(MONAD_TX_GAS_LIMIT);
  return limit < cap ? limit : cap;
}

/** The report RiskOracle decides on (Rule.triggerShockBps), or null before the first publish. */
export function triggerReport(asset: RiskAsset): RiskReport | null {
  const rep = asset.reports.find((r) => r.shockBps === asset.rule.triggerShockBps);
  return rep && rep.publishedAt > 0 ? rep : null;
}

/** Unix seconds when publish() is allowed again (0: now). RiskOracle.sol:114. */
export function nextPublishAt(asset: Pick<RiskAsset, "state" | "rule">): number {
  return asset.state.lastPublished === 0 ? 0 : asset.state.lastPublished + asset.rule.minInterval;
}

/** What GuardV2 / RiskVault make of an asset's state at `nowSec` (GuardV2.sol:54, RiskVault.sol:67). */
export function assetStatus(asset: Pick<RiskAsset, "state">, nowSec: number, maxReportAge: number): AssetStatus {
  const { lastPublished, atRisk } = asset.state;
  if (lastPublished === 0) return "none";
  if (nowSec > lastPublished + maxReportAge) return "stale";
  return atRisk ? "at-risk" : "clear";
}
