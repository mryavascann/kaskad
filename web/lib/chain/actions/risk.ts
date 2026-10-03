"use client";

import { encodeFunctionData, type Address } from "viem";
import { guardV2Abi, riskOracleAbi, riskVaultAbi } from "@/lib/kaskad/abi";
import { RISK } from "@/lib/kaskad/config";
import { defaultReader, type ChainReader } from "../reader";
import { GUARD_V2_REFRESH_GAS, publishGasLimit, readRiskSystem, VAULT_REBALANCE_GAS, type RiskAsset, type RiskSystem } from "../risk-oracle";
import { loadSigner } from "../signer";
import { failBeforeSend, runTx, type TxOptions, type TxOutcome } from "../tx";

type After = { system: RiskSystem | null };
export type RiskActionOutcome = TxOutcome<After, After>;
type Opts = TxOptions & { reader?: ChainReader; account?: Address };

async function send(to: Address, data: `0x${string}`, gas: bigint, confirmGate: boolean, opts: Opts): Promise<RiskActionOutcome> {
  const out = await runTx({ to, data, gas, confirmGate }, opts);
  if (out.status === "cancelled" || out.status === "failed") return out;
  const system = await readRiskSystem(opts.reader).catch(() => null);
  return { ...out, system };
}

/**
 * RiskOracle.publish(asset): a free eth_call first (a cooldown revert fails as `too-soon` without
 * spending), the four previews size the tx, then the system is re-read. Spends MON (~0.2).
 */
export async function publishRisk(asset: Pick<RiskAsset, "assetId" | "rule" | "bookPositions">, opts: Opts = {}): Promise<RiskActionOutcome> {
  opts.onEvent?.({ step: "preparing", detail: "guard-scenario", raw: "" });
  const reader = opts.reader ?? defaultReader();
  let gas: bigint;
  try {
    const account = opts.account ?? (await loadSigner()).signerStore.get().address ?? undefined;
    await reader.simulateContract({ account, address: RISK.riskOracle, abi: riskOracleAbi, functionName: "publish", args: [asset.assetId] });
    gas = await publishGasLimit(asset, reader);
  } catch (e) {
    return failBeforeSend(e, opts);
  }
  const data = encodeFunctionData({ abi: riskOracleAbi, functionName: "publish", args: [asset.assetId] });
  return send(RISK.riskOracle, data, gas, true, opts);
}

/** GuardV2.refresh(): pauses flagged markets, reopens recovered ones. Spends MON (~0.03). */
export async function refreshGuardV2(opts: Opts = {}): Promise<RiskActionOutcome> {
  return send(RISK.guardV2, encodeFunctionData({ abi: guardV2Abi, functionName: "refresh" }), GUARD_V2_REFRESH_GAS, false, opts);
}

/** RiskVault.rebalance(): out of flagged markets, idle spread over the others. Spends MON (~0.04). */
export async function rebalanceVault(opts: Opts = {}): Promise<RiskActionOutcome> {
  return send(RISK.riskVault, encodeFunctionData({ abi: riskVaultAbi, functionName: "rebalance" }), VAULT_REBALANCE_GAS, false, opts);
}
