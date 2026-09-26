/**
 * Kaskad data pipeline, step 4: best-effort DEX exit-liquidity ("depth") per risky collateral.
 *
 * depthUsd = sum of on-chain DEX pool TVL on Monad that trades the token (GeckoTerminal
 * `reserve_in_usd`), or for Pendle PTs the Pendle AMM market liquidity. This is a TVL proxy,
 * not a measured slippage curve. Tokens with no pools fall back to an explicit assumption.
 * Public HTTP APIs only; no RPC, no secrets.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./lib/env.js";
import { sleep } from "./lib/hypersync.js";

const TARGET_IDS = [9, 12, 2, 10, 8]; // syrupUSDC, PT-AUSD, USDe, sUSDe, weETH
const ASSUMPTION_USD = 5_000_000;
const LENDING = /aave|morpho|euler|curvance|neverland|accountable|upshift|beefy|townsquare|folks|gearbox|yuzu|centrifuge|midas|travessia|springx|kintsu|shmonad|magma/i;

interface ReserveLite {
  id: number;
  symbol: string;
  address: string;
}
interface DepthEntry {
  depthUsd: number;
  source: string;
  isAssumption: boolean;
  note: string;
  symbol: string;
  pools?: { name: string; dex: string; reserveUsd: number; volume24hUsd: number; address: string }[];
}

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429 && attempt < 5) {
    await sleep(5000 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

function loadReserves(): ReserveLite[] {
  const p = path.join(DATA_DIR, "positions.json");
  if (!existsSync(p)) throw new Error("run `npm run fetch` first (needs data/positions.json for reserve addresses)");
  return (JSON.parse(readFileSync(p, "utf8")) as { reserves: ReserveLite[] }).reserves;
}

type GtPool = {
  attributes: { name: string; address: string; reserve_in_usd: string; volume_usd: { h24: string } };
  relationships: { dex: { data: { id: string } } };
};

async function gecko(addr: string) {
  const url = `https://api.geckoterminal.com/api/v2/networks/monad/tokens/${addr}/pools?page=1`;
  try {
    const j = await getJson<{ data: GtPool[] }>(url);
    const pools = j.data.map((p) => ({
      name: p.attributes.name,
      dex: p.relationships.dex.data.id,
      reserveUsd: Math.round(Number(p.attributes.reserve_in_usd) || 0),
      volume24hUsd: Math.round(Number(p.attributes.volume_usd.h24) || 0),
      address: p.attributes.address,
    }));
    return { url, pools };
  } catch (e) {
    console.warn(`  GeckoTerminal failed for ${addr}: ${(e as Error).message}`);
    return { url, pools: [] };
  }
}

type PendleMarket = { name: string; address: string; expiry: string; pt: string; details?: { liquidity?: number } };

async function pendleMarkets() {
  const url = "https://api-v2.pendle.finance/core/v1/143/markets/active";
  try {
    const j = await getJson<{ markets: PendleMarket[] }>(url);
    return { url, markets: j.markets };
  } catch (e) {
    console.warn(`  Pendle API failed: ${(e as Error).message}`);
    return { url, markets: [] as PendleMarket[] };
  }
}

type LlamaPool = { chain: string; project: string; symbol: string; tvlUsd: number; pool: string; underlyingTokens?: string[] | null; poolMeta?: string | null };

async function llamaMonad() {
  const url = "https://yields.llama.fi/pools";
  try {
    const j = await getJson<{ data: LlamaPool[] }>(url);
    return { url, pools: j.data.filter((p) => p.chain === "Monad") };
  } catch (e) {
    console.warn(`  DefiLlama failed: ${(e as Error).message}`);
    return { url, pools: [] as LlamaPool[] };
  }
}

async function main() {
  const t0 = Date.now();
  const reserves = loadReserves();
  const [pendle, llama] = await Promise.all([pendleMarkets(), llamaMonad()]);
  console.log(`Pendle active markets on 143: ${pendle.markets.length}; DefiLlama Monad pools: ${llama.pools.length}`);

  const out: Record<string, DepthEntry> = {};
  for (const id of TARGET_IDS) {
    const r = reserves.find((x) => x.id === id);
    if (!r) throw new Error(`reserve ${id} missing`);
    const addr = r.address.toLowerCase();
    const gt = await gecko(r.address);
    await sleep(2500); // GeckoTerminal public limit ~30 req/min

    const dexPools = gt.pools.filter((p) => p.reserveUsd > 0);
    const gtDepth = dexPools.reduce((s, p) => s + p.reserveUsd, 0);
    const llamaDex = llama.pools.filter((p) => (p.underlyingTokens ?? []).some((u) => u.toLowerCase() === addr) && !LENDING.test(p.project));
    const llamaNote = llamaDex.length
      ? ` DefiLlama non-lending pools containing it: ${llamaDex.map((p) => `${p.project} ${p.symbol} $${Math.round(p.tvlUsd).toLocaleString("en-US")}${p.poolMeta ? ` (${p.poolMeta})` : ""}`).join("; ")}.`
      : " DefiLlama lists no non-lending (DEX) pool for it on Monad.";

    const pendleMkts = pendle.markets.filter((m) => m.pt.toLowerCase() === `143-${addr}`);
    let entry: DepthEntry;
    if (pendleMkts.length) {
      const liq = pendleMkts.reduce((s, m) => s + (m.details?.liquidity ?? 0), 0);
      entry = {
        symbol: r.symbol,
        depthUsd: Math.round(liq + gtDepth),
        source: pendle.url,
        isAssumption: false,
        note:
          `Pendle AMM liquidity (PT<->SY-underlying) for market(s) ${pendleMkts.map((m) => `${m.address} exp ${m.expiry.slice(0, 10)}`).join(", ")}` +
          ` = $${Math.round(liq).toLocaleString("en-US")}; GeckoTerminal DEX pools: $${gtDepth.toLocaleString("en-US")}. PT redeems 1:1 for underlying only at expiry.` +
          llamaNote,
        pools: dexPools,
      };
    } else if (dexPools.length) {
      entry = {
        symbol: r.symbol,
        depthUsd: gtDepth,
        source: gt.url,
        isAssumption: false,
        note:
          `Sum of GeckoTerminal reserve_in_usd over ${dexPools.length} Monad DEX pool(s); largest: ${dexPools[0].name} on ${dexPools[0].dex} ($${dexPools[0].reserveUsd.toLocaleString("en-US")}). TVL proxy, not a slippage curve.` +
          llamaNote,
        pools: dexPools,
      };
    } else {
      entry = {
        symbol: r.symbol,
        depthUsd: ASSUMPTION_USD,
        source: "assumption",
        isAssumption: true,
        note: `No Monad DEX pool found on GeckoTerminal or Pendle; assumed $${ASSUMPTION_USD.toLocaleString("en-US")}.` + llamaNote,
      };
    }
    out[String(id)] = entry;
    console.log(`${String(id).padStart(2)} ${r.symbol.padEnd(18)} depth $${entry.depthUsd.toLocaleString("en-US").padStart(12)}  ${entry.isAssumption ? "ASSUMPTION" : entry.source}`);
  }

  const file = path.join(DATA_DIR, "depth.json");
  // Keep the file strictly { "<reserveId>": entry } so consumers can iterate it directly.
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`wrote ${file} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});
