import {
  formatTransactionReceipt,
  keccak256,
  type Hex,
  type PublicClient,
  type RpcTransactionReceipt,
  type TransactionReceipt,
} from "viem";

// Monad: min base fee 100 gwei, eth_maxPriorityFeePerGas is a fixed 2 gwei.
export const MAX_FEE_PER_GAS = 150_000_000_000n;
export const MAX_PRIORITY_FEE_PER_GAS = 2_000_000_000n;

export type SendResult = { receipt: TransactionReceipt; sync: boolean; ms: number };

let syncSupported: boolean | undefined;

/**
 * eth_sendRawTransactionSync returns the receipt in one round trip (~0.5 s on Monad).
 * Falls back to eth_sendRawTransaction + polling when the RPC does not support it.
 */
export async function sendRawSync(client: PublicClient, raw: Hex, timeoutMs = 15_000): Promise<SendResult> {
  const t0 = Date.now();
  const hash = keccak256(raw);
  if (syncSupported !== false) {
    try {
      const rpc = (await client.request({
        method: "eth_sendRawTransactionSync" as "eth_sendRawTransaction",
        params: [raw] as [Hex],
      })) as unknown as RpcTransactionReceipt;
      syncSupported = true;
      return { receipt: formatTransactionReceipt(rpc), sync: true, ms: Date.now() - t0 };
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      const unsupported = /method not found|not supported|does not exist|unsupported|-32601/.test(msg);
      if (unsupported) syncSupported = false;
      else if (!/timeout|timed out|already known/.test(msg)) throw e;
      // timed out or already broadcast: fall through and wait on the hash
    }
  }
  try {
    await client.request({ method: "eth_sendRawTransaction", params: [raw] });
  } catch (e) {
    if (!/already known|known transaction|nonce too low/i.test(String((e as Error)?.message ?? e))) throw e;
  }
  const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: timeoutMs });
  return { receipt, sync: false, ms: Date.now() - t0 };
}
