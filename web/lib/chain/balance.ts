// One `eth_getBalance` with plain fetch, no viem (the signer strip's first read after the first
// paint). Same endpoint rule and error shape as block-number.ts; eth_getBalance is on the proxy's
// allowlist (app/api/rpc/route.ts).

import type { Address } from "viem";
import { BLOCK_NUMBER_TIMEOUT_MS, BlockNumberError, blockNumberEndpoint, parseQuantity } from "./block-number";

let nextId = 1;

/** Balance in wei at the latest block. Throws BlockNumberError on HTTP, RPC or format errors. */
export async function fetchBalance(
  address: Address,
  { url = blockNumberEndpoint(), fetchImpl = fetch, timeoutMs = BLOCK_NUMBER_TIMEOUT_MS }: { url?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<bigint> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "eth_getBalance", params: [address, "latest"] }),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new BlockNumberError(`HTTP request failed.\n\nStatus: ${response.status}\nDetails: ${text.slice(0, 200)}`, response.status);
    const body = JSON.parse(text) as { result?: unknown; error?: { code?: number; message?: string } };
    if (body.error) throw new BlockNumberError(`RPC error ${body.error.code ?? ""}: ${body.error.message ?? "unknown"}`.trim());
    return parseQuantity(body.result);
  } finally {
    clearTimeout(timer);
  }
}
