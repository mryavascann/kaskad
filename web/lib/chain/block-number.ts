// The latest block number without viem: one plain `eth_blockNumber` POST. The site nav polls it on
// every page, and `defaultReader()` (viem's public client, ~100 KB gz with @noble) would otherwise be
// in every page's initial JavaScript. Isomorphic, no directive.

/**
 * Same endpoint rule as TESTNET_RPC (lib/kaskad/config.ts:38-40), repeated here because that module
 * also pulls in deployment.json: an override, else the /api/rpc proxy in the browser (eth_blockNumber
 * is on its allowlist, app/api/rpc/route.ts) and the public Monad testnet RPC on the server.
 */
export function blockNumberEndpoint(): string {
  return (
    process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC ??
    (typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "https://testnet-rpc.monad.xyz")
  );
}

/** Same as viem's http transport default. */
export const BLOCK_NUMBER_TIMEOUT_MS = 10_000;

/** A failed read. The message keeps viem's `Status: <code>` line, so callers can match 429 the same way. */
export class BlockNumberError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BlockNumberError";
  }
}

let nextId = 1;

/** `0x`-prefixed quantity → bigint. Throws on anything else (empty, odd characters, negative). */
export function parseQuantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new BlockNumberError(`Invalid block number: ${String(value)}`);
  return BigInt(value);
}

/** Reads `eth_blockNumber` once. `fetchImpl` and `url` are injectable for tests. */
export async function fetchBlockNumber({
  url = blockNumberEndpoint(),
  fetchImpl = fetch,
  timeoutMs = BLOCK_NUMBER_TIMEOUT_MS,
}: { url?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<bigint> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "eth_blockNumber", params: [] }),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new BlockNumberError(`HTTP request failed.\n\nStatus: ${response.status}\nDetails: ${text.slice(0, 200)}`, response.status);
    let body: { result?: unknown; error?: { code?: number; message?: string } };
    try {
      body = JSON.parse(text);
    } catch {
      throw new BlockNumberError(`Invalid JSON-RPC response: ${text.slice(0, 200)}`);
    }
    if (body.error) throw new BlockNumberError(`RPC error ${body.error.code ?? ""}: ${body.error.message ?? "unknown"}`.trim());
    return parseQuantity(body.result);
  } catch (e) {
    if (controller.signal.aborted) throw new BlockNumberError(`The request took too long to respond (${timeoutMs} ms).`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
