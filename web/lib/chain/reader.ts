// Read client for the wrappers. Isomorphic on purpose: lib/kaskad/burner.ts is a "use client"
// module, so a Server Component that imports its `publicClient` only gets a client reference.

import { createPublicClient, http, type PublicClient } from "viem";
import { monadTestnet } from "viem/chains";
import { TESTNET_RPC } from "@/lib/kaskad/config";

/** The read surface the wrappers use. A viem PublicClient satisfies it; tests pass a stub. */
export type ChainReader = Pick<
  PublicClient,
  "call" | "readContract" | "multicall" | "getBlockNumber" | "getBalance" | "simulateContract"
>;

let shared: PublicClient | undefined;

/** /api/rpc rejects JSON-RPC batches above 20 calls (app/api/rpc/route.ts:38). */
export const MAX_BATCH_CALLS = 20;

/**
 * Same configuration as `publicClient` in lib/kaskad/burner.ts:12-15 (monadTestnet, TESTNET_RPC,
 * JSON-RPC batching), except that a batch is split at MAX_BATCH_CALLS instead of viem's default 1000,
 * so a busy tick can never produce a batch the proxy refuses. In the browser TESTNET_RPC is the
 * /api/rpc proxy; on the server it is the public Monad testnet RPC (lib/kaskad/config.ts:38-40).
 */
export function defaultReader(): ChainReader {
  shared ??= createPublicClient({
    chain: monadTestnet,
    transport: http(TESTNET_RPC, { batch: { batchSize: MAX_BATCH_CALLS } }),
  }) as PublicClient;
  return shared;
}
