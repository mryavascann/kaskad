import { decodeFunctionData, erc20Abi, isAddress, multicall3Abi, parseTransaction, type Abi, type Hex } from "viem";
import { monadTestnet } from "viem/chains";
import deployment from "@/lib/kaskad/deployment.json";
import risk from "@/lib/kaskad/risk-deployment.json";
import { kaskadAbi, kaskadMCAbi, kaskadMCv3Abi, guardAbi, mockMarketAbi, riskOracleAbi, guardV2Abi, riskVaultAbi, mockMarketV2Abi } from "@/lib/kaskad/abi";
import { RPC_BATCH_LIMIT } from "@/lib/chain/api-policy";
import { isRecord } from "./request";

export const RPC_BODY_LIMIT = 256 * 1024;
const MAX_DATA = 64 * 1024;
const GAS_LIMIT = 30_000_000n;
const multicall = monadTestnet.contracts.multicall3.address.toLowerCase();
const rules = new Map<string, { abi: Abi; writes: string[] }>();
function rule(address: string, abi: Abi, writes: string[] = []) { rules.set(address.toLowerCase(), { abi, writes }); }
rule(deployment.contracts.kaskad, kaskadAbi, ["simulate"]);
rule(deployment.contracts.kaskadMC, kaskadMCAbi, ["simulate", "simulateMC"]);
rule(deployment.contracts.guard, guardAbi, ["refresh"]);
rule(deployment.contracts.marketA, mockMarketAbi, ["borrow"]);
rule(deployment.contracts.marketB, mockMarketAbi, ["borrow"]);
rule(risk.kaskadMCv3, kaskadMCv3Abi);
rule(risk.riskOracle, riskOracleAbi, ["publish"]);
rule(risk.guardV2, guardV2Abi, ["refresh"]);
rule(risk.riskVault, riskVaultAbi, ["rebalance"]);
rule(risk.marketSyrupUSDC, mockMarketV2Abi);
rule(risk.marketWETH, mockMarketV2Abi);
rule(risk.kUSD, erc20Abi);

export type RpcCall = { jsonrpc: "2.0"; id: string | number | null; method: string; params: unknown[] };
const hex = (v: unknown): v is Hex => typeof v === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(v);
const quantity = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(v);
const address = (v: unknown): v is Hex => typeof v === "string" && isAddress(v, { strict: false });
const hash = (v: unknown) => hex(v) && v.length === 66;
const block = (v: unknown) => typeof v === "string" && (quantity(v) || ["latest", "pending", "earliest", "safe", "finalized"].includes(v));

function contractCall(to: string, data: unknown, write = false): boolean {
  const r = rules.get(to.toLowerCase());
  if (!r || !hex(data) || data.length < 10 || data.length > MAX_DATA * 2 + 2) return false;
  try {
    const decoded = decodeFunctionData({ abi: r.abi, data });
    if (r.writes.includes(decoded.functionName)) return true; // also used by free simulateContract
    if (write) return false;
    return r.abi.some((f) => f.type === "function" && f.name === decoded.functionName && ["view", "pure"].includes(f.stateMutability));
  } catch { return false; }
}

function ethCall(params: unknown[]): boolean {
  if (params.length < 1 || params.length > 2 || (params.length === 2 && !block(params[1]))) return false;
  const tx = params[0];
  if (!isRecord(tx) || !address(tx.to)) return false;
  if (Object.keys(tx).some((k) => !["to", "data", "from", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "value"].includes(k))) return false;
  if (tx.from !== undefined && !address(tx.from)) return false;
  for (const k of ["gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "value"]) if (tx[k] !== undefined && !quantity(tx[k])) return false;
  if (tx.value !== undefined && BigInt(tx.value as Hex) !== 0n) return false;
  if (tx.gas !== undefined && (BigInt(tx.gas as Hex) === 0n || BigInt(tx.gas as Hex) > GAS_LIMIT)) return false;
  if (tx.to.toLowerCase() === multicall) {
    if (!hex(tx.data) || tx.data.length > MAX_DATA * 2 + 2) return false;
    try {
      const decoded = decodeFunctionData({ abi: multicall3Abi, data: tx.data });
      if (decoded.functionName !== "aggregate3") return false;
      const [calls] = decoded.args;
      // Check every inner destination. Nested multicalls cannot tunnel to unrelated contracts.
      if (!calls.length || calls.length > 128 || !calls.every((c) => contractCall(c.target, c.callData))) return false;
    } catch { return false; }
  } else if (!contractCall(tx.to, tx.data)) return false;
  tx.gas ??= `0x${GAS_LIMIT.toString(16)}`;
  return true;
}

function signedCall(params: unknown[]): boolean {
  if (params.length !== 1 || !hex(params[0]) || params[0].length > MAX_DATA * 2 + 2) return false;
  try {
    const tx = parseTransaction(params[0]);
    // App signers emit EIP-1559. Refuse legacy replay, creation and EIP-7702 delegations.
    return tx.type === "eip1559" && tx.chainId === monadTestnet.id && !!tx.to &&
      !!tx.r && BigInt(tx.r) > 0n && !!tx.s && BigInt(tx.s) > 0n && (tx.yParity === 0 || tx.yParity === 1) &&
      (tx.value ?? 0n) === 0n && !!tx.gas && tx.gas <= GAS_LIMIT && contractCall(tx.to, tx.data, true);
  } catch { return false; }
}

export function validRpcCall(value: unknown): value is RpcCall {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || !(value.id === null || typeof value.id === "string" || (typeof value.id === "number" && Number.isSafeInteger(value.id)))) return false;
  if (typeof value.id === "string" && value.id.length > 128) return false;
  if (Object.keys(value).some((k) => !["jsonrpc", "id", "method", "params"].includes(k))) return false;
  if (!Array.isArray(value.params)) return false;
  const p = value.params;
  switch (value.method) {
    case "eth_chainId": case "eth_blockNumber": return p.length === 0;
    case "eth_getBalance": case "eth_getTransactionCount": return p.length === 2 && address(p[0]) && block(p[1]);
    case "eth_getTransactionReceipt": case "eth_getTransactionByHash": return p.length === 1 && hash(p[0]);
    case "eth_call": return ethCall(p);
    case "eth_sendRawTransaction": case "eth_sendRawTransactionSync": return signedCall(p);
    default: return false;
  }
}

export function validateRpc(body: unknown): RpcCall[] | null {
  const calls = Array.isArray(body) ? body : [body];
  return calls.length > 0 && calls.length <= RPC_BATCH_LIMIT && calls.every(validRpcCall) ? calls : null;
}

/** Preserve revert bytes needed by viem, but never relay provider error messages/URLs. */
export function safeRpcResult(value: unknown): unknown {
  if (!isRecord(value) || value.jsonrpc !== "2.0") throw new Error("Invalid RPC response");
  if (!value.error) {
    if (!("result" in value)) throw new Error("Invalid RPC response");
    return { jsonrpc: "2.0", id: value.id ?? null, result: value.result };
  }
  const error = isRecord(value.error) ? value.error : {};
  const raw = typeof error.message === "string" ? error.message.toLowerCase() : "";
  // The public testnet provider uses -32011 / "requests limited to 15/sec". viem retries 429,
  // but not that provider-specific code. Preserve backoff without exposing the provider text.
  const rateLimited = error.code !== 3 && (error.code === 429 || /rate.?limit|requests? limited|too many requests|request limit/.test(raw));
  const message = rateLimited ? "rate limit exceeded" : error.code === -32601 ? "method not supported" : /out of gas|gas required exceeds/.test(raw) ? "out of gas" :
    /already known|known transaction/.test(raw) ? "already known" : /nonce too low/.test(raw) ? "nonce too low" :
    /timeout|timed out/.test(raw) ? "request timed out" : /execution reverted/.test(raw) ? "execution reverted" : "execution failed";
  const data = isRecord(error.data) ? error.data.data : error.data;
  return { jsonrpc: "2.0", id: value.id ?? null, error: { code: rateLimited ? 429 : typeof error.code === "number" ? error.code : -32000, message, ...(hex(data) && data.length <= 65538 ? { data } : {}) } };
}
