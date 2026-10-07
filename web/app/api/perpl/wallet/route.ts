import { createPublicClient, getAddress, http, isAddress, type PublicClient } from "viem";
import { monad } from "viem/chains";
import { readPerplWallet } from "@/lib/kaskad/perpl-wallet";
import type { PerplWallet } from "@/lib/chain/perpl-wallet-risk";

const cache = new Map<string, { at: number; data: Promise<PerplWallet> }>();
const hits = new Map<string, { since: number; count: number }>();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const input = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!isAddress(input)) return json({ error: "invalid_address" }, 400);
  const rpc = process.env.MONAD_MAINNET_RPC;
  if (!rpc) return json({ error: "unconfigured" }, 503);
  const address = getAddress(input);
  const now = Date.now();
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  for (const [key, hit] of hits) if (now - hit.since >= 60_000) hits.delete(key);
  const hit = hits.get(ip);
  if (hit && hit.count >= 30) return json({ error: "rate_limited" }, 429);
  // This is a bounded per-instance guard, not a shared production rate limiter.
  if (!hit && hits.size >= 1_000) return json({ error: "rate_limited" }, 429);
  hits.set(ip, { since: hit?.since ?? now, count: (hit?.count ?? 0) + 1 });
  let entry = cache.get(address);
  if (!entry || now - entry.at >= 8_000) {
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    const client = createPublicClient({ chain: monad, transport: http(rpc, { timeout: 15_000, retryCount: 0 }) }) as PublicClient;
    entry = { at: now, data: readPerplWallet(client, address) };
    cache.set(address, entry);
    const pending = entry;
    entry.data.catch(() => { if (cache.get(address) === pending) cache.delete(address); });
  }
  try {
    return json(await entry.data);
  } catch {
    return json({ error: "read_failed" }, 502);
  }
}
