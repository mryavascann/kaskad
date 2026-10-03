// RiskOracle / GuardV2 / RiskVault actions with an injected `send`: nothing reaches sendTx or the network.
import { decodeFunctionData, type Address, type Hex, type TransactionReceipt } from "viem";
import { describe, expect, it, vi } from "vitest";
import { guardV2Abi, riskOracleAbi, riskVaultAbi } from "@/lib/kaskad/abi";
import { RISK } from "@/lib/kaskad/config";
import { publishRisk, rebalanceVault, refreshGuardV2 } from "./actions/risk";
import type { ChainReader } from "./reader";
import { GUARD_V2_REFRESH_GAS, publishGasFromPreviews, VAULT_REBALANCE_GAS, type RiskRule } from "./risk-oracle";
import type { SendFn } from "./tx";

const HASH = `0x${"cd".repeat(32)}` as Hex;
const SENDER = "0x00000000000000000000000000000000000000aa" as Address;
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
const asset = { assetId: 9, rule, bookPositions: 57 };
const PREVIEW_GAS = [334_080n, 404_341n, 433_604n, 435_349n];

const send = () =>
  vi.fn<SendFn>(async () => ({ receipt: { transactionHash: HASH, status: "success", logs: [] } as unknown as TransactionReceipt, ms: 300, sync: true }));

/** Previews answer with the measured syrupUSDC gas; the system re-read fails (system: null). */
function reader(simulate: () => Promise<unknown> = async () => ({ result: [true, 8_500] })) {
  const simulateContract = vi.fn(simulate);
  const multicall = vi.fn(async (req: { contracts: { functionName: string }[] }) => {
    if (req.contracts[0].functionName !== "previewWithHidden") throw new Error("no system in this test");
    return PREVIEW_GAS.map((gasUsed) => [{ gasUsed }, {}]);
  });
  const readContract = vi.fn(async () => {
    throw new Error("no system in this test");
  });
  return { simulateContract, multicall, r: { simulateContract, multicall, readContract } as unknown as ChainReader };
}

describe("publishRisk", () => {
  it("a cooldown revert fails the free pre-check as too-soon, nothing sent", async () => {
    const { r } = reader(async () => {
      throw new Error('The contract function "publish" reverted.\n\nError: TooSoon(uint64 nextAt)');
    });
    const s = send();
    const out = await publishRisk(asset, { reader: r, send: s, signerKind: "burner", account: SENDER });
    expect(out).toMatchObject({ status: "failed", error: { code: "too-soon" } });
    expect(s).not.toHaveBeenCalled();
  });

  it("publish(asset) on RiskOracle, sized from the four previews", async () => {
    const { r, simulateContract } = reader();
    const s = send();
    const out = await publishRisk(asset, { reader: r, send: s, signerKind: "burner", account: SENDER });
    expect(simulateContract).toHaveBeenCalledWith(expect.objectContaining({ account: SENDER, address: RISK.riskOracle, functionName: "publish", args: [9] }));
    const [to, data, gas] = s.mock.calls[0];
    expect(to).toBe(RISK.riskOracle);
    expect(gas).toBe(publishGasFromPreviews(PREVIEW_GAS));
    expect(decodeFunctionData({ abi: riskOracleAbi, data })).toMatchObject({ functionName: "publish", args: [9] });
    expect(out).toMatchObject({ status: "confirmed", hash: HASH, system: null });
  });
});

describe("GuardV2 and RiskVault", () => {
  it("refresh() and rebalance() with their fixed limits", async () => {
    const { r } = reader();
    const s = send();
    await refreshGuardV2({ reader: r, send: s, signerKind: "burner" });
    await rebalanceVault({ reader: r, send: s, signerKind: "burner" });
    const [[g, gData, gGas], [v, vData, vGas]] = s.mock.calls;
    expect([g, gGas, decodeFunctionData({ abi: guardV2Abi, data: gData }).functionName]).toEqual([RISK.guardV2, GUARD_V2_REFRESH_GAS, "refresh"]);
    expect([v, vGas, decodeFunctionData({ abi: riskVaultAbi, data: vData }).functionName]).toEqual([RISK.riskVault, VAULT_REBALANCE_GAS, "rebalance"]);
  });
});
