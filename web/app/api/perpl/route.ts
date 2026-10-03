import { createPublicClient, http, type PublicClient } from "viem";
import { monad } from "viem/chains";
import { isPerplSymbol, PERPL_MARKETS, readPerplMarket } from "@/lib/kaskad/perpl";
import type { PerpMarket } from "@/lib/chain/perpl-model";

// Perps risk panel data: one Perpl market (every open position, margins, insurance fund, order
// book) from Monad MAINNET and Perpl's public API. Read-only; the RPC key stays on the server.
// One read per market at most every CACHE_MS, shared by every visitor.
const CACHE_MS = 8_000;
const cache = new Map<number, { at: number; data: Promise<PerpMarket> }>();
const hits = new Map<string, number[]>();

export async function GET(req: Request) {
  const rpc = process.env.MONAD_MAINNET_RPC;
  if (!rpc) return Response.json({ error: "mainnet RPC yapılandırılmamış" }, { status: 503 });
  const symbol = (new URL(req.url).searchParams.get("market") ?? "").toUpperCase();
  if (!isPerplSymbol(symbol)) return Response.json({ error: "bilinmeyen piyasa" }, { status: 400 });
  const { perpId } = PERPL_MARKETS.find((m) => m.symbol === symbol)!;

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 30) return Response.json({ error: "çok fazla istek" }, { status: 429 });
  list.push(now);
  hits.set(ip, list);

  let entry = cache.get(perpId);
  if (!entry || now - entry.at > CACHE_MS) {
    const client = createPublicClient({ chain: monad, transport: http(rpc, { timeout: 15_000 }) }) as PublicClient;
    entry = { at: now, data: readPerplMarket(client, perpId) };
    cache.set(perpId, entry);
    entry.data.catch(() => cache.delete(perpId));
  }
  try {
    return Response.json(await entry.data, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "perpl okuması başarısız" }, { status: 502 });
  }
}
