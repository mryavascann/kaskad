// Guard (on-chain circuit breaker) and the two demo markets. Reads copied from
// app/_components/GuardPanel.tsx; copy that hard-coded "%0,5" / "%70" now reads the Guard itself.

import type { Address } from "viem";
import { guardAbi, mockMarketAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { previewScenario, type ReadOptions } from "./engine";
import { defaultReader, type ChainReader } from "./reader";
import type { MarketState, Result, Scenario } from "./types";

/** Gas limit of a demo borrow() tx (GuardPanel.tsx:17). */
export const BORROW_GAS = 80_000n;
/** Amount the "try to borrow" button borrows: 1,000 units, 18 decimals (GuardPanel.tsx:147, :151). */
export const BORROW_AMOUNT = 1_000n * 10n ** 18n;
/** Guard.refresh() overhead on top of the engine's simulate gas limit (GuardPanel.tsx:94, :126). */
export const GUARD_TX_OVERHEAD_GAS = 150_000n;
/** Market state refresh period (GuardPanel.tsx:112). */
export const GUARD_POLL_MS = 6_000;

/** Market A has no protection; market B is the one the Guard pauses (GuardPanel.tsx:174-191). */
export const MARKETS = {
  a: { id: "a", address: DEPLOYMENT.contracts.marketA, guarded: false },
  b: { id: "b", address: DEPLOYMENT.contracts.marketB, guarded: true },
} as const;
export type MarketId = keyof typeof MARKETS;

/** GuardPanel.tsx:19-27: three plain reads, JSON-RPC batched (no Multicall3 needed). */
export async function readMarket(address: Address, reader: ChainReader = defaultReader()): Promise<MarketState> {
  const [paused, ltv, borrowed] = await Promise.all([
    reader.readContract({ address, abi: mockMarketAbi, functionName: "borrowPaused" }),
    reader.readContract({ address, abi: mockMarketAbi, functionName: "maxLtvBps" }),
    reader.readContract({ address, abi: mockMarketAbi, functionName: "totalBorrowed" }),
  ]);
  return { paused, maxLtvBps: Number(ltv), borrowed };
}

/** Both markets in one tick (GuardPanel.tsx:102-108): 6 calls, one HTTP batch. */
export async function readMarkets(reader: ChainReader = defaultReader()): Promise<Record<MarketId, MarketState>> {
  const [a, b] = await Promise.all([readMarket(MARKETS.a.address, reader), readMarket(MARKETS.b.address, reader)]);
  return { a, b };
}

export type GuardConfig = {
  address: Address;
  /** Scenario refresh() runs, e.g. syrupUSDC -3 % with the pool oracle (read, not assumed). */
  scenario: Scenario;
  /** Trips when bad debt / simulated debt exceeds this (Guard.sol:18). */
  badDebtThresholdBps: number;
  /** Trips when liquidated / simulated debt exceeds this; 0 = disabled (Guard.sol:19). */
  liquidationThresholdBps: number;
  /** Max LTV the Guard sets on the protected market when it trips (Guard.sol:20, :65). */
  safeLtvBps: number;
  /** Engine refresh() calls (Guard.sol:14); the legacy copy showed DEPLOYMENT.kaskad instead. */
  engine: Address;
  /** Protected market (Guard.sol:15). */
  market: Address;
};

/** Everything the Guard section's copy needs, read from the Guard (6 calls, one HTTP batch). */
export async function readGuardConfig(reader: ChainReader = defaultReader()): Promise<GuardConfig> {
  const address = DEPLOYMENT.contracts.guard;
  const [scenario, badDebtThresholdBps, liquidationThresholdBps, safeLtvBps, engine, market] = await Promise.all([
    reader.readContract({ address, abi: guardAbi, functionName: "scenario" }),
    reader.readContract({ address, abi: guardAbi, functionName: "badDebtThresholdBps" }),
    reader.readContract({ address, abi: guardAbi, functionName: "liquidationThresholdBps" }),
    reader.readContract({ address, abi: guardAbi, functionName: "safeLtvBps" }),
    reader.readContract({ address, abi: guardAbi, functionName: "engine" }),
    reader.readContract({ address, abi: guardAbi, functionName: "market" }),
  ]);
  return {
    address,
    scenario: { ...scenario },
    badDebtThresholdBps: Number(badDebtThresholdBps),
    liquidationThresholdBps: Number(liquidationThresholdBps),
    safeLtvBps: Number(safeLtvBps),
    engine,
    market,
  };
}

/** The Guard's stored scenario (GuardPanel.tsx:92, :124). */
export async function readGuardScenario(reader: ChainReader = defaultReader()): Promise<Scenario> {
  const s = await reader.readContract({ address: DEPLOYMENT.contracts.guard, abi: guardAbi, functionName: "scenario" });
  return { ...s };
}

/** refresh() gas limit from a preview of the Guard's scenario (GuardPanel.tsx:94, :126). */
export const guardGasFromPreview = (p: Pick<Result, "gasUsed" | "rounds">): bigint =>
  simulateGasLimit(p.gasUsed, p.rounds) + GUARD_TX_OVERHEAD_GAS;

/**
 * GuardPanel.tsx:88-100: read the scenario, preview it (free, on engineFor(assetId) like the legacy
 * code), size the tx. 2 sequential eth_calls.
 */
export async function guardGasLimit(opts: ReadOptions = {}): Promise<bigint> {
  const sc = await readGuardScenario(opts.reader);
  return guardGasFromPreview(await previewScenario(sc, opts));
}

export type GuardVerdict = {
  badDebtRatioBps: number;
  liquidationRatioBps: number;
  /** refresh() would pause the protected market for this result. */
  wouldTrip: boolean;
};

/** Mirror of Guard.refresh()'s decision (contracts/src/Guard.sol:58-60), integer bps like the contract. */
export function guardVerdict(
  r: Pick<Result, "totalDebt" | "badDebt" | "totalLiquidated">,
  cfg: Pick<GuardConfig, "badDebtThresholdBps" | "liquidationThresholdBps">,
): GuardVerdict {
  const bad = r.totalDebt === 0n ? 0n : (r.badDebt * 10_000n) / r.totalDebt;
  const liq = r.totalDebt === 0n ? 0n : (r.totalLiquidated * 10_000n) / r.totalDebt;
  const wouldTrip =
    bad > BigInt(cfg.badDebtThresholdBps) ||
    (cfg.liquidationThresholdBps !== 0 && liq > BigInt(cfg.liquidationThresholdBps));
  return { badDebtRatioBps: Number(bad), liquidationRatioBps: Number(liq), wouldTrip };
}

/** What a trip does to the protected market (Guard.sol:63-65): pause, and lower max LTV if higher. */
export function guardEffect(cfg: Pick<GuardConfig, "safeLtvBps">, market: MarketState): { paused: true; maxLtvBps: number } {
  return { paused: true, maxLtvBps: cfg.safeLtvBps < market.maxLtvBps ? cfg.safeLtvBps : market.maxLtvBps };
}
