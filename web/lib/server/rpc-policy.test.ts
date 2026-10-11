import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, multicall3Abi, serializeTransaction, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { kaskadAbi, kaskadMCAbi, kaskadMCv3Abi, guardAbi, mockMarketAbi, riskOracleAbi, guardV2Abi, riskVaultAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT, RISK } from "@/lib/kaskad/config";
import { safeRpcResult, validateRpc } from "./rpc-policy";

const c = DEPLOYMENT.contracts;
const stranger = "0x0000000000000000000000000000000000000001";
const scenario = { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 0, oracleFeedbackBps: 0 };
const rpc = (method: string, params: unknown[] = []) => ({ jsonrpc: "2.0", id: 1, method, params });
const call = (to: string, data: string, extra = {}) => rpc("eth_call", [{ to, data, ...extra }, "latest"]);
const slots = encodeFunctionData({ abi: kaskadAbi, functionName: "rawSlot", args: [9n, 0n] });
const aggregate = (calls: { target: Address; callData: Hex }[]) => encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [calls.map((c) => ({ ...c, allowFailure: false }))] });
// Public deterministic test key, used only to sign in memory. Never broadcast.
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const transaction = { chainId: 10143, type: "eip1559" as const, to: c.guard, data: encodeFunctionData({ abi: guardAbi, functionName: "refresh" }), nonce: 0, gas: 300_000n, maxFeePerGas: 150_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n };

describe("RPC destination and payload policy", () => {
  it("accepts deployed engine previews and all public app actions", () => {
    const entries: [Address, Hex][] = [
      [c.kaskad, encodeFunctionData({ abi: kaskadAbi, functionName: "preview", args: [scenario] })],
      [c.kaskadMC!, encodeFunctionData({ abi: kaskadMCAbi, functionName: "previewMC", args: [scenario, 30n, 1n] })],
      [RISK.kaskadMCv3, encodeFunctionData({ abi: kaskadMCv3Abi, functionName: "previewWithHidden", args: [scenario] })],
      [c.kaskad, encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] })],
      [c.kaskadMC!, encodeFunctionData({ abi: kaskadMCAbi, functionName: "simulateMC", args: [scenario, 30n, 1n] })],
      [c.guard, transaction.data],
      [c.marketA, encodeFunctionData({ abi: mockMarketAbi, functionName: "borrow", args: [1n] })],
      [RISK.riskOracle, encodeFunctionData({ abi: riskOracleAbi, functionName: "publish", args: [9] })],
      [RISK.guardV2, encodeFunctionData({ abi: guardV2Abi, functionName: "refresh" })],
      [RISK.riskVault, encodeFunctionData({ abi: riskVaultAbi, functionName: "rebalance" })],
    ];
    for (const [to, data] of entries) expect(validateRpc(call(to, data)), to).not.toBeNull();
  });
  it("validates every inner multicall, including 64-slot book reads", () => {
    const multi = monadTestnet.contracts.multicall3.address as Address;
    const inner = { target: c.kaskad, callData: slots };
    expect(validateRpc(call(multi, aggregate(Array.from({ length: 64 }, () => inner))))).not.toBeNull();
    const rejected: { target: Address; callData: Hex }[][] = [[], Array.from({ length: 129 }, () => inner), [inner, { target: stranger, callData: slots }], [{ target: multi, callData: aggregate([inner]) }]];
    for (const calls of rejected)
      expect(validateRpc(call(multi, aggregate(calls)))).toBeNull();
  });
  it("rejects foreign targets, unknown selectors, admin writes, state overrides and excessive gas", () => {
    const admin = encodeFunctionData({ abi: kaskadAbi, functionName: "resetBook", args: [9n] });
    for (const value of [call(stranger, slots), call(c.kaskad, "0x12345678"), call(c.kaskad, "0x12"), call(c.kaskad, admin),
      call(c.kaskad, slots, { value: "0x1" }), call(c.kaskad, slots, { gas: "0x1c9c381" }), call(c.kaskad, slots, { gas: "0x0" }),
      call(c.kaskad, slots, { authorizationList: [] }), rpc("eth_call", [{ to: c.kaskad, data: slots }, "latest", {}])]) expect(validateRpc(value)).toBeNull();
    const allowed = call(c.kaskad, slots);
    expect(validateRpc(allowed)?.[0].params[0]).toMatchObject({ gas: "0x1c9c380" });
  });
  it("rejects malformed envelopes, notifications, unsafe methods and batches above ten", () => {
    for (const body of [null, [], {}, [rpc("eth_chainId"), null], rpc("eth_getLogs"), rpc("eth_sendTransaction"), { ...rpc("eth_chainId"), id: undefined }, { ...rpc("eth_chainId"), params: null }, { ...rpc("eth_chainId"), extra: true }]) expect(validateRpc(body)).toBeNull();
    expect(validateRpc(Array.from({ length: 10 }, () => rpc("eth_chainId")))).toHaveLength(10);
    expect(validateRpc(Array.from({ length: 11 }, () => rpc("eth_chainId")))).toBeNull();
    expect(validateRpc(rpc("eth_getBalance", [stranger, "0x1234"]))).not.toBeNull();
    expect(validateRpc(rpc("eth_getBalance", [stranger, {}]))).toBeNull();
  });
  it("accepts signed testnet actions, but rejects transfers, other chains, deployments and privileged selectors", async () => {
    const valid = await account.signTransaction(transaction);
    expect(validateRpc(rpc("eth_sendRawTransactionSync", [valid]))).not.toBeNull();
    const rejected = [
      serializeTransaction(transaction),
      await account.signTransaction({ ...transaction, chainId: 1 }),
      await account.signTransaction({ ...transaction, to: stranger }),
      await account.signTransaction({ ...transaction, value: 1n }),
      await account.signTransaction({ ...transaction, to: undefined }),
      await account.signTransaction({ ...transaction, gas: 30_000_001n }),
      await account.signTransaction({ ...transaction, to: c.kaskad, data: slots }),
      await account.signTransaction({ ...transaction, to: RISK.kUSD, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [stranger, 1n] }) }),
      await account.signTransaction({ ...transaction, type: "legacy", gasPrice: 150_000_000_000n, maxFeePerGas: undefined, maxPriorityFeePerGas: undefined }),
    ];
    for (const raw of rejected) expect(validateRpc(rpc("eth_sendRawTransaction", [raw]))).toBeNull();
    expect(validateRpc(rpc("eth_sendRawTransactionSync", [valid, "extra"]))).toBeNull();
  });
  it("preserves error codes and revert bytes without provider URLs or text", () => {
    expect(safeRpcResult({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted at https://secret/key", data: "0x12345678", stack: "secret" } })).toEqual({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted", data: "0x12345678" } });
    expect(safeRpcResult({ jsonrpc: "2.0", id: 2, error: { code: -32601, message: "secret" } })).toMatchObject({ error: { message: "method not supported" } });
    expect(safeRpcResult({ jsonrpc: "2.0", error: { message: "out of gas, secret" } })).toMatchObject({ error: { message: "out of gas" } });
  });
  it("normalizes provider rate limits so viem can retry, without rewriting contract reverts", () => {
    expect(safeRpcResult({ jsonrpc: "2.0", id: 1, error: { code: -32011, message: "requests limited to 15/sec, https://secret/key" } })).toEqual({ jsonrpc: "2.0", id: 1, error: { code: 429, message: "rate limit exceeded" } });
    expect(safeRpcResult({ jsonrpc: "2.0", id: 2, error: { code: 3, message: "execution reverted: rate limit" } })).toMatchObject({ error: { code: 3, message: "execution reverted" } });
  });
});
