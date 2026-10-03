"use client";

// The proof actions, loaded on first use. Each action module pulls viem's encoder, the event
// decoders and (through runTx) the signer, so the pages import these wrappers instead: same
// signatures and outcomes, the module is fetched with import() when the button is pressed (or
// earlier through preloadAction on hover / focus). A failed chunk load becomes a `failed` outcome
// with its event, like any other error before sending.

import type { Address } from "viem";
import type { ChainReader } from "../reader";
import { loadSigner } from "../signer";
import { failBeforeSend, type TxOptions } from "../tx";
import type { MonteCarloResult, Result, Scenario } from "../types";
import type { BorrowOutcome } from "./borrow";
import type { ProveMonteCarloOutcome } from "./proveMonteCarlo";
import type { ProveScenarioOutcome } from "./proveScenario";
import type { RiskAsset } from "../risk-oracle";
import type { RiskActionOutcome } from "./risk";
import type { RunGuardOutcome } from "./runGuard";

export type { BorrowOutcome, ProveMonteCarloOutcome, ProveScenarioOutcome, RiskActionOutcome, RunGuardOutcome };
export { proveMonteCarloGasLimit, proveScenarioGasLimit } from "./gas";

const loaders = {
  proveScenario: () => import("./proveScenario"),
  proveMonteCarlo: () => import("./proveMonteCarlo"),
  runGuard: () => import("./runGuard"),
  borrow: () => import("./borrow"),
  risk: () => import("./risk"),
};

/** Starts loading an action module (and, for sends, the signer) ahead of the click. */
export function preloadAction(name: keyof typeof loaders): void {
  void loaders[name]().catch(() => {});
  void loadSigner().catch(() => {});
}

/** lib/chain/actions/proveScenario.ts, loaded on first use. Spends MON. */
export async function proveScenario(scenario: Scenario, preview: Result, opts: TxOptions = {}): Promise<ProveScenarioOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.proveScenario>>;
  try {
    mod = await loaders.proveScenario();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.proveScenario(scenario, preview, opts);
}

/** lib/chain/actions/proveMonteCarlo.ts, loaded on first use. Spends MON. */
export async function proveMonteCarlo(base: Scenario, paths: number, preview: MonteCarloResult, opts: TxOptions = {}): Promise<ProveMonteCarloOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.proveMonteCarlo>>;
  try {
    mod = await loaders.proveMonteCarlo();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.proveMonteCarlo(base, paths, preview, opts);
}

/** lib/chain/actions/runGuard.ts, loaded on first use. Spends MON. */
export async function runGuard(opts: TxOptions & { reader?: ChainReader } = {}): Promise<RunGuardOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.runGuard>>;
  try {
    mod = await loaders.runGuard();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.runGuard(opts);
}

/** lib/chain/actions/borrow.ts, loaded on first use. Spends MON when the free pre-check passes. */
export async function borrow(market: Address, opts: TxOptions & { reader?: ChainReader; account?: Address } = {}): Promise<BorrowOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.borrow>>;
  try {
    mod = await loaders.borrow();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.borrow(market, opts);
}

type RiskOpts = TxOptions & { reader?: ChainReader; account?: Address };

/** lib/chain/actions/risk.ts publishRisk, loaded on first use. Spends MON when the free pre-check passes. */
export async function publishRisk(asset: Pick<RiskAsset, "assetId" | "rule" | "bookPositions">, opts: RiskOpts = {}): Promise<RiskActionOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.risk>>;
  try {
    mod = await loaders.risk();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.publishRisk(asset, opts);
}

/** lib/chain/actions/risk.ts refreshGuardV2, loaded on first use. Spends MON. */
export async function refreshGuardV2(opts: RiskOpts = {}): Promise<RiskActionOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.risk>>;
  try {
    mod = await loaders.risk();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.refreshGuardV2(opts);
}

/** lib/chain/actions/risk.ts rebalanceVault, loaded on first use. Spends MON. */
export async function rebalanceVault(opts: RiskOpts = {}): Promise<RiskActionOutcome> {
  let mod: Awaited<ReturnType<typeof loaders.risk>>;
  try {
    mod = await loaders.risk();
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  return mod.rebalanceVault(opts);
}
