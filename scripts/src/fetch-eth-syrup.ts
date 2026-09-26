/**
 * Kaskad comparison dataset: Aave V3 Ethereum (Core market) borrowers whose dominant collateral
 * is syrupUSDC, in the same schema as data/positions.json, plus Ethereum DEX depth for syrupUSDC.
 *
 *  1. Candidates: HyperSync Supply logs on the Ethereum Core Pool with reserve (topic1) = syrupUSDC;
 *     supplier = onBehalfOf (topic2). No full Borrow scan.
 *  2. Current on-chain state at one pinned block via Multicall3 on a public RPC (gentle batching).
 *  3. Normalize exactly like fetch-positions.ts, keep syrupUSDC-dominant positions with debt,
 *     cap to the top MAX_POSITIONS by debt. collateralId is rewritten to the synthetic id 15.
 *  4. Depth: GeckoTerminal Ethereum pools for syrupUSDC (TVL proxy) + DefiLlama cross-check.
 *
 * READ-ONLY: only eth_call / eth_blockNumber. Never sends transactions.
 *
 * Usage: npm run fetch-eth              (re-queries HyperSync)
 *        npm run fetch-eth -- --cached  (reuse data/eth-syrup.raw.json candidates)
 *        npm run fetch-eth -- --asset syrupUSDT  (same pipeline for syrupUSDT -> data/eth-syrupusdt.json)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, fallback, getAddress, http, keccak256, pad, parseAbi, toBytes, type Address } from "viem";
import { mainnet } from "viem/chains";
import { DATA_DIR } from "./lib/env.js";
import { redact } from "./lib/chain.js";
import { poolAbi, dataProviderAbi, oracleAbi, erc20Abi } from "./lib/abis.js";
import { fetchLogs, sleep } from "./lib/hypersync.js";

const t0 = Date.now();
mkdirSync(DATA_DIR, { recursive: true });

// Aave V3 Ethereum Core (bgd-labs/aave-address-book AaveV3Ethereum). DATA_PROVIDER / ORACLE are
// resolved on-chain from Pool.ADDRESSES_PROVIDER() and cross-checked against these.
const ETH = {
  POOL: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  ORACLE: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
} as const satisfies Record<string, Address>;
// Target collateral. Default syrupUSDC (Maple, 0x80ac...Cc0b). NOTE: as of block ~26.06M syrupUSDC is
// NOT listed on Aave V3 Ethereum Core (only syrupUSDT is), so the default run fails loudly by design.
const ASSETS = {
  syrupUSDC: { symbol: "syrupUSDC", address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b", outFile: "eth-syrup.json", rawFile: "eth-syrup.raw.json" },
  syrupUSDT: { symbol: "syrupUSDT", address: "0x356B8d89c1e1239Cbbb9dE4815c39A1474d5BA7D", outFile: "eth-syrupusdt.json", rawFile: "eth-syrupusdt.raw.json" },
} as const satisfies Record<string, { symbol: string; address: Address; outFile: string; rawFile: string }>;
const assetArg = process.argv.includes("--asset") ? process.argv[process.argv.indexOf("--asset") + 1] : "syrupUSDC";
if (!(assetArg in ASSETS)) throw new Error("--asset must be one of: " + Object.keys(ASSETS).join(", "));
const ASSET = ASSETS[assetArg as keyof typeof ASSETS];
const POOL_DEPLOY_BLOCK = 16_291_127; // Aave V3 Ethereum Pool deployment
const HYPERSYNC_ETH = "https://eth.hypersync.xyz";
const RPCS = ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"];

const SYNTHETIC_ID = 15; // Kaskad contract id for "syrup collateral on Ethereum" (intended: syrupUSDC)
const MAX_POSITIONS = 300;
const SUPPLY_EVENT_SIG = "Supply(address,address,address,uint256,uint16)";

const USER_CHUNK = 20; // users per account-data multicall (3 calls each)
const BAL_CALL_CHUNK = 150;
const CONCURRENCY = 2;
const PAUSE_MS = 300;

const BASE = 1e8;
const WAD = 10n ** 18n;

const client = createPublicClient({
  chain: mainnet,
  transport: fallback(RPCS.map((u) => http(u, { retryCount: 4, retryDelay: 1000, timeout: 60_000 }))),
});

const extraAbi = parseAbi([
  "function ADDRESSES_PROVIDER() view returns (address)",
  "function getPoolDataProvider() view returns (address)",
  "function getPriceOracle() view returns (address)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);
const bytes32SymbolAbi = parseAbi(["function symbol() view returns (bytes32)"]);

// ---------------------------------------------------------------------------------------------
// helpers (same semantics as fetch-positions.ts)

type Call = { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] };
type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

let rpcRequests = 0;
let blockNumber: bigint | undefined;

async function mc(calls: Call[], attempt = 0): Promise<CallResult[]> {
  if (calls.length === 0) return [];
  try {
    rpcRequests++;
    const res = await client.multicall({ contracts: calls as never, allowFailure: true, blockNumber, batchSize: 0 });
    return res as CallResult[];
  } catch (e) {
    const msg = redact((e as Error).message.split("\n")[0].slice(0, 140));
    if (calls.length <= 5) {
      if (attempt < 3) {
        console.warn(`  multicall of ${calls.length} failed (${msg}); retry ${attempt + 1}`);
        await sleep(3000 * (attempt + 1));
        return mc(calls, attempt + 1);
      }
      throw e;
    }
    console.warn(`  multicall of ${calls.length} failed (${msg}); splitting`);
    await sleep(1500);
    const mid = Math.floor(calls.length / 2);
    return [...(await mc(calls.slice(0, mid))), ...(await mc(calls.slice(mid)))];
  }
}

async function mcChunked(calls: Call[], chunk: number, label: string): Promise<CallResult[]> {
  const chunks: Call[][] = [];
  for (let i = 0; i < calls.length; i += chunk) chunks.push(calls.slice(i, i + chunk));
  const out: CallResult[][] = new Array(chunks.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < chunks.length) {
      const idx = next++;
      out[idx] = await mc(chunks[idx]);
      done++;
      if (done % 10 === 0 || done === chunks.length) console.log(`  ${label}: ${done}/${chunks.length} batches`);
      await sleep(PAUSE_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  return out.flat();
}

function ok<T>(r: CallResult, what: string): T {
  if (r.status !== "success") throw new Error(`call failed: ${what}: ${redact(r.error.message.split("\n")[0])}`);
  return r.result as T;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function toUsd(raw: bigint, priceUsd8: bigint, decimals: number): number {
  return Number((raw * priceUsd8) / 10n ** BigInt(decimals)) / BASE;
}
const round2 = (x: number) => Math.round(x * 100) / 100;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

const isBorrowing = (cfg: bigint, i: number) => ((cfg >> BigInt(2 * i)) & 1n) === 1n;
const isCollateral = (cfg: bigint, i: number) => ((cfg >> BigInt(2 * i + 1)) & 1n) === 1n;
const inBitmap = (bm: bigint, i: number) => ((bm >> BigInt(i)) & 1n) === 1n;
const extraBonus = (raw: number) => (raw > 10000 ? raw - 10000 : 0);

// ---------------------------------------------------------------------------------------------
// Step 1: candidates via HyperSync (Supply logs of syrupUSDC)

async function getCandidates(): Promise<{ candidates: Address[]; meta: Record<string, unknown> }> {
  const cachePath = path.join(DATA_DIR, ASSET.rawFile);
  if (process.argv.includes("--cached") && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as { candidates: Address[] } & Record<string, unknown>;
    console.log(`[1] using cached candidates: ${cached.candidates.length}`);
    const { candidates, ...meta } = cached;
    return { candidates, meta };
  }
  const topic0 = keccak256(toBytes(SUPPLY_EVENT_SIG));
  const topic1 = pad(ASSET.address.toLowerCase() as Address, { size: 32 });
  console.log(`[1] HyperSync ${HYPERSYNC_ETH}: Supply logs on Pool ${ETH.POOL}, reserve=${ASSET.symbol}`);
  const res = await fetchLogs(
    { url: HYPERSYNC_ETH, address: [ETH.POOL], topic0, moreTopics: [[topic1]], fromBlock: POOL_DEPLOY_BLOCK },
    (p) => {
      if (p.pages % 10 === 0) console.log(`  page ${p.pages}: next_block=${p.nextBlock} / ${p.archiveHeight}, logs=${p.logs}`);
    },
  );
  const set = new Set<string>();
  let wrongReserve = 0;
  for (const l of res.logs) {
    if ((l.topics[1] ?? "").toLowerCase() !== topic1.toLowerCase()) {
      wrongReserve++;
      continue;
    }
    const t2 = l.topics[2];
    if (t2) set.add(getAddress(`0x${t2.slice(-40)}`));
  }
  if (wrongReserve) console.warn(`[1] WARNING: ${wrongReserve} logs with unexpected topic1 ignored`);
  const candidates = [...set].sort() as Address[];
  const firstBlock = res.logs.length ? Math.min(...res.logs.map((l) => l.blockNumber)) : null;
  const lastBlock = res.logs.length ? Math.max(...res.logs.map((l) => l.blockNumber)) : null;
  const meta = {
    generatedAt: new Date().toISOString(),
    chainId: 1,
    pool: ETH.POOL,
    event: SUPPLY_EVENT_SIG,
    reserveFilter: ASSET.address,
    archiveHeight: res.archiveHeight,
    supplyEvents: res.logs.length - wrongReserve,
    firstBlock,
    lastBlock,
    transport: res.transport,
  };
  console.log(
    `[1] ${meta.supplyEvents} ${ASSET.symbol} Supply events in ${res.pages} pages via ${res.transport}; blocks ${firstBlock}..${lastBlock}; unique suppliers (onBehalfOf) = ${candidates.length}`,
  );
  writeFileSync(cachePath, JSON.stringify({ ...meta, candidates }, null, 1));
  return { candidates, meta };
}

// ---------------------------------------------------------------------------------------------
// Step 2a: addresses, reserves, eModes

interface Reserve {
  id: number;
  symbol: string;
  address: Address;
  decimals: number;
  price: bigint;
  ltBps: number;
  ltvBps: number;
  bonusRaw: number;
  collateralEnabled: boolean;
  aToken: Address;
  vToken: Address;
  totalSupplied: bigint;
  totalDebt: bigint;
}
interface EMode {
  id: number;
  label: string;
  ltvBps: number;
  ltBps: number;
  bonusRaw: number;
  collateralBitmap: bigint;
  borrowableBitmap: bigint;
}

async function resolveAddresses() {
  const [apR] = await mc([{ address: ETH.POOL, abi: extraAbi, functionName: "ADDRESSES_PROVIDER" }]);
  const provider = ok<Address>(apR, "ADDRESSES_PROVIDER");
  const [dpR, orR] = await mc([
    { address: provider, abi: extraAbi, functionName: "getPoolDataProvider" },
    { address: provider, abi: extraAbi, functionName: "getPriceOracle" },
  ]);
  const dataProvider = ok<Address>(dpR, "getPoolDataProvider");
  const oracle = ok<Address>(orR, "getPriceOracle");
  if (oracle.toLowerCase() !== ETH.ORACLE.toLowerCase()) console.warn(`[2] NOTE: on-chain oracle ${oracle} != expected ${ETH.ORACLE}; using on-chain`);
  console.log(`[2] PoolAddressesProvider ${provider} | DataProvider ${dataProvider} | Oracle ${oracle}`);
  return { provider, dataProvider, oracle };
}

async function loadReserves(dataProvider: Address, oracle: Address): Promise<Reserve[]> {
  const [listR, unitR] = await mc([
    { address: ETH.POOL, abi: poolAbi, functionName: "getReservesList" },
    { address: oracle, abi: oracleAbi, functionName: "BASE_CURRENCY_UNIT" },
  ]);
  const list = ok<Address[]>(listR, "getReservesList");
  const unit = ok<bigint>(unitR, "BASE_CURRENCY_UNIT");
  if (unit !== 100000000n) throw new Error(`unexpected oracle BASE_CURRENCY_UNIT ${unit}`);

  // prices: batch call, fall back to per-asset if one source reverts
  let prices: bigint[];
  const [pr] = await mc([{ address: oracle, abi: oracleAbi, functionName: "getAssetsPrices", args: [list] }]);
  if (pr.status === "success") prices = pr.result as bigint[];
  else {
    console.warn("[2] getAssetsPrices reverted; falling back to getAssetPrice per asset");
    const r = await mc(list.map((a) => ({ address: oracle, abi: extraAbi, functionName: "getAssetPrice", args: [a] })));
    prices = r.map((x) => (x.status === "success" ? (x.result as bigint) : 0n));
  }

  const calls: Call[] = [];
  for (const a of list) {
    calls.push({ address: a, abi: erc20Abi, functionName: "symbol" });
    calls.push({ address: a, abi: bytes32SymbolAbi, functionName: "symbol" });
    calls.push({ address: dataProvider, abi: dataProviderAbi, functionName: "getReserveConfigurationData", args: [a] });
    calls.push({ address: dataProvider, abi: dataProviderAbi, functionName: "getReserveTokensAddresses", args: [a] });
  }
  const r = await mcChunked(calls, 80, "reserve config");
  const partial = list.map((address, id) => {
    const s1 = r[id * 4];
    const s2 = r[id * 4 + 1];
    let symbol = s1.status === "success" ? (s1.result as string) : "";
    if (!symbol && s2.status === "success") symbol = Buffer.from((s2.result as string).slice(2), "hex").toString("utf8").replace(/\0+$/, "");
    if (!symbol) symbol = address.slice(0, 10);
    const cfg = ok<readonly [bigint, bigint, bigint, bigint, bigint, boolean, ...unknown[]]>(r[id * 4 + 2], `cfg ${address}`);
    const toks = ok<readonly [Address, Address, Address]>(r[id * 4 + 3], `tokens ${address}`);
    return {
      id,
      symbol,
      address,
      decimals: Number(cfg[0]),
      ltvBps: Number(cfg[1]),
      ltBps: Number(cfg[2]),
      bonusRaw: Number(cfg[3]),
      collateralEnabled: cfg[5],
      price: prices[id],
      aToken: toks[0],
      vToken: toks[2],
    };
  });
  const sup = await mcChunked(
    partial.flatMap((p) => [
      { address: p.aToken, abi: erc20Abi, functionName: "totalSupply" },
      { address: p.vToken, abi: erc20Abi, functionName: "totalSupply" },
    ]),
    80,
    "reserve supply",
  );
  const val = (x: CallResult) => (x.status === "success" ? (x.result as bigint) : 0n);
  return partial.map((p, i) => ({ ...p, totalSupplied: val(sup[i * 2]), totalDebt: val(sup[i * 2 + 1]) }));
}

async function loadEModes(): Promise<EMode[]> {
  // eMode ids are uint8; probe 1..255 in chunks and keep any configured category.
  const ids = Array.from({ length: 255 }, (_, i) => i + 1);
  const r = await mcChunked(
    ids.flatMap((id) => [
      { address: ETH.POOL, abi: poolAbi, functionName: "getEModeCategoryLabel", args: [id] },
      { address: ETH.POOL, abi: poolAbi, functionName: "getEModeCategoryCollateralConfig", args: [id] },
      { address: ETH.POOL, abi: poolAbi, functionName: "getEModeCategoryCollateralBitmap", args: [id] },
      { address: ETH.POOL, abi: poolAbi, functionName: "getEModeCategoryBorrowableBitmap", args: [id] },
    ]),
    128,
    "eModes",
  );
  const out: EMode[] = [];
  ids.forEach((id, i) => {
    const label = ok<string>(r[i * 4], `label ${id}`);
    const cfg = ok<{ ltv: number; liquidationThreshold: number; liquidationBonus: number }>(r[i * 4 + 1], `cfg ${id}`);
    if (label === "" && cfg.liquidationThreshold === 0) return;
    out.push({
      id,
      label,
      ltvBps: cfg.ltv,
      ltBps: cfg.liquidationThreshold,
      bonusRaw: cfg.liquidationBonus,
      collateralBitmap: ok<bigint>(r[i * 4 + 2], `collBitmap ${id}`),
      borrowableBitmap: ok<bigint>(r[i * 4 + 3], `borrBitmap ${id}`),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Step 4: depth

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429 && attempt < 5) {
    await sleep(5000 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

type GtPool = {
  attributes: { name: string; address: string; reserve_in_usd: string; volume_usd: { h24: string } };
  relationships: { dex: { data: { id: string } } };
};
type LlamaPool = { chain: string; project: string; symbol: string; tvlUsd: number; pool: string; underlyingTokens?: string[] | null; poolMeta?: string | null };
const LENDING = /aave|morpho|euler|spark|compound|fluid|maple|kamino|gearbox|silo|dolomite|venus|radiant|yearn|beefy|summer|idle|sommelier|upshift|termmax|inverse|notional|contango|resolv|level/i;

async function fetchDepth() {
  const addr = ASSET.address.toLowerCase();
  const gtUrl = `https://api.geckoterminal.com/api/v2/networks/eth/tokens/${ASSET.address}/pools?page=1`;
  let pools: { name: string; dex: string; reserveUsd: number; volume24hUsd: number; address: string }[] = [];
  let gtError: string | null = null;
  try {
    const j = await getJson<{ data: GtPool[] }>(gtUrl);
    pools = j.data
      .map((p) => ({
        name: p.attributes.name,
        dex: p.relationships.dex.data.id,
        reserveUsd: Math.round(Number(p.attributes.reserve_in_usd) || 0),
        volume24hUsd: Math.round(Number(p.attributes.volume_usd.h24) || 0),
        address: p.attributes.address,
      }))
      .filter((p) => p.reserveUsd > 0)
      .sort((a, b) => b.reserveUsd - a.reserveUsd);
  } catch (e) {
    gtError = (e as Error).message;
    console.warn(`[4] GeckoTerminal failed: ${gtError}`);
  }
  let llamaNote = "";
  try {
    const j = await getJson<{ data: LlamaPool[] }>("https://yields.llama.fi/pools");
    const eth = j.data.filter((p) => p.chain === "Ethereum" && (p.underlyingTokens ?? []).some((u) => u.toLowerCase() === addr));
    const dex = eth.filter((p) => !LENDING.test(p.project)).sort((a, b) => b.tvlUsd - a.tvlUsd);
    const lend = eth.filter((p) => LENDING.test(p.project)).sort((a, b) => b.tvlUsd - a.tvlUsd);
    llamaNote = dex.length
      ? ` DefiLlama (yields.llama.fi) non-lending Ethereum pools containing ${ASSET.symbol}: ${dex.slice(0, 8).map((p) => `${p.project} ${p.symbol} ${usd(p.tvlUsd)}${p.poolMeta ? ` (${p.poolMeta})` : ""}`).join("; ")}.`
      : ` DefiLlama lists no non-lending (DEX) Ethereum pool with ${ASSET.symbol} as underlying.`;
    if (lend.length) llamaNote += ` Lending markets using it (not exit liquidity): ${lend.slice(0, 5).map((p) => `${p.project} ${usd(p.tvlUsd)}`).join("; ")}.`;
  } catch (e) {
    llamaNote = ` DefiLlama cross-check failed: ${(e as Error).message}.`;
  }
  const total = pools.reduce((s, p) => s + p.reserveUsd, 0);
  if (pools.length === 0) {
    return {
      depthUsd: 25_000_000,
      source: "assumption",
      isAssumption: true,
      note: `GeckoTerminal returned no Ethereum pool${gtError ? ` (${gtError})` : ""}; assumed $25,000,000.` + llamaNote,
      pools,
    };
  }
  return {
    depthUsd: total,
    source: gtUrl,
    isAssumption: false,
    note:
      `Sum of GeckoTerminal reserve_in_usd over ${pools.length} Ethereum DEX pool(s) (page 1 = top pools); largest: ${pools[0].name} on ${pools[0].dex} (${usd(pools[0].reserveUsd)}). ` +
      `TVL proxy (both sides of each pool), not a slippage curve; excludes Maple's native withdrawal queue.` +
      llamaNote,
    pools,
  };
}

// ---------------------------------------------------------------------------------------------
// main

interface AccountData {
  user: Address;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  healthFactor: bigint;
  eMode: number;
  config: bigint;
}

async function main() {
  const { candidates, meta } = await getCandidates();

  blockNumber = await client.getBlockNumber();
  console.log(`[2] pinned block ${blockNumber}`);
  const { provider, dataProvider, oracle } = await resolveAddresses();
  const reserves = await loadReserves(dataProvider, oracle);
  const syrup = reserves.find((r) => r.address.toLowerCase() === ASSET.address.toLowerCase());
  if (!syrup) throw new Error(`${ASSET.symbol} ${ASSET.address} is NOT in getReservesList of ${ETH.POOL}`);
  console.log(`[2] ${reserves.length} reserves; ${ASSET.symbol} = reserve #${syrup.id} (${syrup.symbol}, ${syrup.decimals}dp, price ${syrup.price}, LT ${syrup.ltBps}, collateral ${syrup.collateralEnabled})`);
  const eModes = await loadEModes();
  const eModeById = new Map(eModes.map((e) => [e.id, e]));
  const syrupEModes = eModes.filter((e) => inBitmap(e.collateralBitmap, syrup.id));
  console.log(`[2] ${eModes.length} eMode categories; with ${ASSET.symbol} as collateral: ${syrupEModes.map((e) => `${e.id}:${e.label}(LT ${e.ltBps}, bonus ${e.bonusRaw})`).join(", ") || "none"}`);

  const acctCalls: Call[] = candidates.flatMap((u) => [
    { address: ETH.POOL, abi: poolAbi, functionName: "getUserAccountData", args: [u] },
    { address: ETH.POOL, abi: poolAbi, functionName: "getUserEMode", args: [u] },
    { address: ETH.POOL, abi: poolAbi, functionName: "getUserConfiguration", args: [u] },
  ]);
  const acctRes = await mcChunked(acctCalls, USER_CHUNK * 3, "account data");
  const accounts: AccountData[] = [];
  let failed = 0;
  candidates.forEach((user, i) => {
    const [a, e, c] = [acctRes[i * 3], acctRes[i * 3 + 1], acctRes[i * 3 + 2]];
    if (a.status !== "success" || e.status !== "success" || c.status !== "success") {
      failed++;
      return;
    }
    const ad = a.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    accounts.push({ user, totalCollateralBase: ad[0], totalDebtBase: ad[1], healthFactor: ad[5], eMode: Number(e.result as bigint), config: (c.result as { data: bigint }).data });
  });
  if (failed) console.warn(`[2] WARNING: ${failed} candidates had failed account-data calls`);
  // pre-filter: debt > 0 and syrupUSDC enabled as collateral (necessary for it to be the dominant collateral)
  const withDebt = accounts.filter((a) => a.totalDebtBase > 0n);
  const relevant = withDebt.filter((a) => isCollateral(a.config, syrup.id));
  console.log(`[2] ${accounts.length} accounts read, ${withDebt.length} with debt > 0, ${relevant.length} of those use ${ASSET.symbol} as collateral`);

  type BalRef = { u: number; reserve: number; kind: "a" | "v" };
  const balRefs: BalRef[] = [];
  const balCalls: Call[] = [];
  relevant.forEach((acc, u) => {
    for (const r of reserves) {
      if (isCollateral(acc.config, r.id)) {
        balRefs.push({ u, reserve: r.id, kind: "a" });
        balCalls.push({ address: r.aToken, abi: erc20Abi, functionName: "balanceOf", args: [acc.user] });
      }
      if (isBorrowing(acc.config, r.id)) {
        balRefs.push({ u, reserve: r.id, kind: "v" });
        balCalls.push({ address: r.vToken, abi: erc20Abi, functionName: "balanceOf", args: [acc.user] });
      }
    }
  });
  const balRes = await mcChunked(balCalls, BAL_CALL_CHUNK, "balances");
  const coll: Map<number, bigint>[] = relevant.map(() => new Map());
  const debt: Map<number, bigint>[] = relevant.map(() => new Map());
  balRefs.forEach((ref, i) => {
    const v = ok<bigint>(balRes[i], `balanceOf ${ref.kind} ${ref.reserve} ${relevant[ref.u].user}`);
    (ref.kind === "a" ? coll : debt)[ref.u].set(ref.reserve, v);
  });

  // Step 3: normalize (identical rules to fetch-positions.ts)
  const all: Record<string, unknown>[] = [];
  const hfDiffModel: number[] = [];
  const hfDiffExact: number[] = [];
  const collDiff: number[] = [];
  const otherDominant = new Map<string, number>();

  relevant.forEach((acc, u) => {
    const em = acc.eMode > 0 ? eModeById.get(acc.eMode) : undefined;
    const ltFor = (id: number) =>
      em && inBitmap(em.collateralBitmap, id) ? { lt: em.ltBps, bonus: em.bonusRaw, emode: true } : { lt: reserves[id].ltBps, bonus: reserves[id].bonusRaw, emode: false };
    const collUsd = [...coll[u].entries()]
      .map(([id, raw]) => ({ id, raw, usd: toUsd(raw, reserves[id].price, reserves[id].decimals) }))
      .filter((c) => c.raw > 0n)
      .sort((a, b) => b.usd - a.usd);
    if (collUsd.length === 0) return;
    const dom = collUsd[0];
    if (dom.id !== syrup.id) {
      const s = reserves[dom.id].symbol;
      otherDominant.set(s, (otherDominant.get(s) ?? 0) + 1);
      return;
    }
    const debtUsd = Number(acc.totalDebtBase) / BASE;
    const debtByAsset: Record<string, number> = {};
    for (const [id, raw] of debt[u]) if (raw > 0n) debtByAsset[id] = round2(toUsd(raw, reserves[id].price, reserves[id].decimals));
    const otherUsd = collUsd.slice(1).reduce((s, c) => s + c.usd, 0);
    const { lt, bonus } = ltFor(dom.id);
    const hfOnchain = acc.healthFactor >= 2n ** 255n ? Infinity : Number((acc.healthFactor * 1_000_000n) / WAD) / 1e6;
    const hfModel = debtUsd > 0 ? ((dom.usd + otherUsd) * lt) / 1e4 / debtUsd : Infinity;
    const hfExact = debtUsd > 0 ? collUsd.reduce((s, c) => s + c.usd * ltFor(c.id).lt, 0) / 1e4 / debtUsd : Infinity;
    if (Number.isFinite(hfOnchain)) {
      hfDiffModel.push(Math.abs(hfModel - hfOnchain));
      hfDiffExact.push(Math.abs(hfExact - hfOnchain));
    }
    const onchainColl = Number(acc.totalCollateralBase) / BASE;
    if (onchainColl > 0) collDiff.push(Math.abs(dom.usd + otherUsd - onchainColl) / onchainColl);

    all.push({
      user: acc.user,
      eMode: acc.eMode,
      collateralId: SYNTHETIC_ID,
      ethReserveId: dom.id,
      collateralRaw: dom.raw.toString(),
      collateralDecimals: reserves[dom.id].decimals,
      collateralUsd: round2(dom.usd),
      otherCollateralUsd: round2(otherUsd),
      debtUsd: round2(debtUsd),
      ltBps: lt,
      bonusBps: extraBonus(bonus),
      hfOnchain: Number.isFinite(hfOnchain) ? round6(hfOnchain) : null,
      hfModel: Number.isFinite(hfModel) ? round6(hfModel) : null,
      debtByAsset,
    });
  });
  all.sort((a, b) => (b.debtUsd as number) - (a.debtUsd as number));
  const positions = all.slice(0, MAX_POSITIONS);
  const dropped = all.length - positions.length;
  const allDebt = all.reduce((s, p) => s + (p.debtUsd as number), 0);
  const allColl = all.reduce((s, p) => s + (p.collateralUsd as number) + (p.otherCollateralUsd as number), 0);
  const keptDebt = positions.reduce((s, p) => s + (p.debtUsd as number), 0);
  const keptDomColl = positions.reduce((s, p) => s + (p.collateralUsd as number), 0);
  const keptColl = positions.reduce((s, p) => s + (p.collateralUsd as number) + (p.otherCollateralUsd as number), 0);
  const keptShare = allDebt > 0 ? keptDebt / allDebt : 1;

  const ltUsed = [...new Set(positions.map((p) => p.ltBps as number))].sort((a, b) => a - b);
  const eModeUsed = new Map<number, number>();
  for (const p of positions) eModeUsed.set(p.eMode as number, (eModeUsed.get(p.eMode as number) ?? 0) + 1);
  const hfs = positions.map((p) => p.hfOnchain as number | null).filter((x): x is number => x !== null);

  const depth = await fetchDepth();

  const usedIds = new Set<number>([syrup.id]);
  for (const p of positions) for (const k of Object.keys(p.debtByAsset as object)) usedIds.add(+k);
  const eModesOut = eModes
    .filter((e) => eModeUsed.has(e.id) || inBitmap(e.collateralBitmap, syrup.id))
    .map((e) => ({
      id: e.id,
      label: e.label,
      ltvBps: e.ltvBps,
      ltBps: e.ltBps,
      bonusBps: extraBonus(e.bonusRaw),
      collateralBitmap: e.collateralBitmap.toString(),
      borrowableBitmap: e.borrowableBitmap.toString(),
      assetIsCollateral: inBitmap(e.collateralBitmap, syrup.id),
      keptPositions: eModeUsed.get(e.id) ?? 0,
    }));

  const syrupSuppliedUsd = round2(toUsd(syrup.totalSupplied, syrup.price, syrup.decimals));
  const out = {
    generatedAt: new Date().toISOString(),
    chainId: 1,
    block: Number(blockNumber),
    source: "aave-v3-ethereum-core",
    addresses: { pool: ETH.POOL, poolAddressesProvider: provider, dataProvider, oracle, asset: syrup.address },
    notes: {
      scope:
        `Aave V3 Ethereum Core borrowers (debt > 0) whose dominant collateral (largest USD among collateral-enabled aToken balances) is ${ASSET.symbol}. ` +
        `Candidates = unique onBehalfOf of Pool Supply events with reserve = ${ASSET.symbol} (HyperSync, blocks ${meta.firstBlock}..${meta.lastBlock}); ` +
        `holders who only received aSyrupUSDC by transfer are not covered.`,
      syntheticId: `collateralId is the synthetic Kaskad id ${SYNTHETIC_ID} ("${ASSET.symbol} on Ethereum") for every position; the real Aave Ethereum reserve index is ethReserveId (${syrup.id}). debtByAsset keys are Ethereum reserve indices (see ethReserves).`,
      cap: `Kept the top ${positions.length} of ${all.length} ${ASSET.symbol}-dominant positions by debtUsd; dropped ${dropped}. Kept positions hold ${(keptShare * 100).toFixed(2)}% of the ${ASSET.symbol}-dominant debt (${usd(keptDebt)} of ${usd(allDebt)}).`,
      hfModel:
        "hfModel = (collateralUsd + otherCollateralUsd) * ltBps / 1e4 / debtUsd, i.e. the dominant collateral's LT applied to ALL collateral (MVP approximation). hfOnchain = Pool.getUserAccountData.healthFactor / 1e18.",
      ltRule:
        "ltBps/bonusBps: eMode category values if user eMode > 0 and dominant asset is in the category collateralBitmap (aave-v3-origin GenericLogic/LiquidationLogic), else reserve values. bonusBps is the extra part (10400 -> 400).",
      totals:
        `totals.collateralUsd/debtUsd are over the kept positions (collateralUsd includes otherCollateralUsd; byAsset collateralUsd = dominant collateral only). totals.reserveSuppliedUsd = ${ASSET.symbol} aToken totalSupply on Aave Ethereum Core (all suppliers); reserveDebtUsd = 0 (${ASSET.symbol} is not borrowed). totals.all* = before the cap.`,
      depth: `depth = Ethereum DEX exit liquidity for ${ASSET.symbol} (GeckoTerminal reserve_in_usd sum, TVL proxy) with DefiLlama cross-check, same format as data/depth.json entries.`,
    },
    reserves: [
      {
        id: SYNTHETIC_ID,
        symbol: `${ASSET.symbol} (Ethereum)`,
        address: syrup.address,
        decimals: syrup.decimals,
        priceUsd8: syrup.price.toString(),
        ltBps: syrup.ltBps,
        ltvBps: syrup.ltvBps,
        bonusBps: extraBonus(syrup.bonusRaw),
        totalSupplied: syrup.totalSupplied.toString(),
        totalDebt: "0",
        suppliedUsd: syrupSuppliedUsd,
        debtUsd: 0,
        ethReserveId: syrup.id,
        chainId: 1,
      },
    ],
    ethReserves: reserves
      .filter((r) => usedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        symbol: r.symbol,
        address: r.address,
        decimals: r.decimals,
        priceUsd8: r.price.toString(),
        ltBps: r.ltBps,
        ltvBps: r.ltvBps,
        bonusBps: extraBonus(r.bonusRaw),
        suppliedUsd: round2(toUsd(r.totalSupplied, r.price, r.decimals)),
        debtUsd: round2(toUsd(r.totalDebt, r.price, r.decimals)),
      })),
    eModes: eModesOut,
    totals: {
      positions: positions.length,
      collateralUsd: round2(keptColl),
      debtUsd: round2(keptDebt),
      reserveSuppliedUsd: syrupSuppliedUsd,
      reserveDebtUsd: 0,
      candidates: candidates.length,
      candidatesWithDebt: withDebt.length,
      candidatesWithDebtUsingSyrupAsCollateral: relevant.length,
      syrupDominantAll: all.length,
      dropped,
      allCollateralUsd: round2(allColl),
      allDebtUsd: round2(allDebt),
      keptDebtShare: round6(keptShare),
      otherDominantCollateral: Object.fromEntries([...otherDominant.entries()].sort((a, b) => b[1] - a[1])),
      byAsset: {
        [String(SYNTHETIC_ID)]: { positions: positions.length, collateralUsd: round2(keptDomColl), debtUsd: round2(keptDebt), ltBpsUsed: ltUsed },
      },
    },
    depth: { depthUsd: depth.depthUsd, source: depth.source, isAssumption: depth.isAssumption, note: depth.note, pools: depth.pools },
    positions,
  };
  const outPath = path.join(DATA_DIR, ASSET.outFile);
  writeFileSync(outPath, JSON.stringify(out, null, 1));

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n================ SUMMARY ================");
  console.log(`block ${blockNumber} | runtime ${secs}s | RPC multicall requests ${rpcRequests}`);
  console.log(`candidates ${candidates.length} | with debt ${withDebt.length} | syrup as collateral ${relevant.length} | syrup-dominant ${all.length} | kept ${positions.length} | dropped ${dropped}`);
  console.log(`other dominant collateral among syrup-collateral debtors: ${[...otherDominant.entries()].map(([s, n]) => `${s}:${n}`).join(", ") || "none"}`);
  console.log(`kept: collateral ${usd(keptColl)} (${ASSET.symbol} ${usd(keptDomColl)}) | debt ${usd(keptDebt)} | ${(keptShare * 100).toFixed(2)}% of syrup-dominant debt ${usd(allDebt)}`);
  console.log(`${ASSET.symbol} reserve supplied ${usd(syrupSuppliedUsd)}; price ${Number(syrup.price) / 1e8}`);
  console.log(`LT used ${ltUsed.join("/")} | eModes of kept: ${[...eModeUsed.entries()].map(([id, n]) => `${id}:${eModeById.get(id)?.label ?? "none"}(${n})`).join(", ")}`);
  console.log(`bonus used ${[...new Set(positions.map((p) => p.bonusBps))].join("/")}`);
  console.log(
    `HF onchain: min ${Math.min(...hfs).toFixed(4)} | median ${median(hfs).toFixed(4)} | <1.00 ${hfs.filter((h) => h < 1).length} | <1.02 ${hfs.filter((h) => h < 1.02).length} | <1.05 ${hfs.filter((h) => h < 1.05).length} | <1.10 ${hfs.filter((h) => h < 1.1).length}`,
  );
  console.log(`HF |model - onchain|: median ${median(hfDiffModel).toFixed(6)}, p90 ${quantile(hfDiffModel, 0.9).toFixed(4)}, max ${Math.max(...hfDiffModel).toFixed(4)}`);
  console.log(`HF |exact-rule - onchain|: median ${median(hfDiffExact).toExponential(2)}, max ${Math.max(...hfDiffExact).toExponential(2)}`);
  console.log(`collateral USD rel diff vs on-chain: median ${median(collDiff).toExponential(2)}, max ${Math.max(...collDiff).toExponential(2)}`);
  console.log(`depth ${usd(depth.depthUsd)} (${depth.isAssumption ? "ASSUMPTION" : "measured"}): ${depth.pools.map((p) => `${p.name}@${p.dex} ${usd(p.reserveUsd)}`).join("; ")}`);
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error("FAILED:", redact((e as Error).message.split("\n").slice(0, 3).join(" | ")));
  process.exit(1);
});
