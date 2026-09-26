import { createPublicClient, defineChain, http, type Address } from "viem";
import { requireEnv } from "./env.js";

export const ADDR = {
  POOL: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
  POOL_ADDRESSES_PROVIDER: "0x34793Fb9935F7bB5E5aE920fb963F39063E7A615",
  DATA_PROVIDER: "0xB65A68B98274ef7D9a60E0C0747dD1BEc3D32fad",
  ORACLE: "0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf",
  UI_POOL_DATA_PROVIDER: "0xa7D38785be3422c25677A8aa4a44D3a0853A3a17",
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11",
} as const satisfies Record<string, Address>;

export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [] } },
  contracts: { multicall3: { address: ADDR.MULTICALL3 } },
});

export function makeClient() {
  // Never log the URL: it embeds the Alchemy key.
  return createPublicClient({
    chain: monad,
    transport: http(requireEnv("MONAD_MAINNET_RPC"), { retryCount: 5, retryDelay: 750, timeout: 60_000 }),
  });
}

/** Strip the RPC URL (contains the API key) from any error text before printing it. */
export function redact(msg: string): string {
  const url = process.env.MONAD_MAINNET_RPC?.trim();
  let out = url ? msg.split(url).join("<MONAD_MAINNET_RPC>") : msg;
  out = out.replace(/https?:\/\/[^\s"']*alchemy[^\s"']*/gi, "<rpc-url>");
  const tok = process.env.ENVIO_API_TOKEN?.trim();
  if (tok) out = out.split(tok).join("<ENVIO_API_TOKEN>");
  return out;
}
