/**
 * Kaskad comparison datasets from Aave V3 Ethereum (Core market): borrowers whose dominant collateral
 * is a chosen asset (or one member of an asset family), in the same schema as data/positions.json,
 * plus Ethereum DEX depth for that asset under a `depth` key.
 *
 *  1. Candidates: HyperSync Supply logs on the Ethereum Core Pool with reserve (topic1) in the target
 *     set; supplier = onBehalfOf (topic2). No full Borrow scan.
 *  2. Current on-chain state at one pinned block via Multicall3 on a public RPC (gentle batching).
 *     Cheap pre-filter: getUserConfiguration (bitmap) -> only users that borrow something AND have a
 *     target asset enabled as collateral get the expensive getUserAccountData / balance calls.
 *  3. Normalize exactly like fetch-positions.ts; keep positions whose dominant collateral is the
 *     target (for a family: the member that backs the most debt), cap to the top MAX_POSITIONS by
 *     debt. collateralId is rewritten to a synthetic Kaskad id; real index kept in ethReserveId.
 *  4. Depth: GeckoTerminal Ethereum pools for the asset (TVL proxy) + DefiLlama cross-check.
 *
 * READ-ONLY: only eth_call / eth_blockNumber. Never sends transactions.
 *
 * Usage: npm run fetch-eth                       syrupUSDC -> data/eth-syrup.json (fails: not an Aave Core reserve)
 *        npm run fetch-eth -- --asset syrupUSDT  -> data/eth-syrupusdt.json
 *        npm run fetch-eth -- --asset usde       USDe / sUSDe family -> data/eth-usde.json
 *        npm run fetch-eth -- --asset weth       WETH (last ~90d; ETH-debt loops + dust excluded) -> data/eth-weth.json
 *        npm run fetch-eth -- --asset usdc       USDC (last ~180d of Supply events; USDC-debt loops excluded) -> data/eth-usdc.json
 *        add --cached to reuse data/<out>.raw.json candidates
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

type Member = { symbol: string; address: Address };
type AssetCfg = {
  label: string;
  members: readonly Member[];
  syntheticId: number;
  outFile: string;
  rawFile: string;
  /** limit candidate discovery to Supply events in the last N blocks (huge histories) */
  recentBlocks?: number;
  /** exclude positions whose debt in the collateral asset itself is >= this share of total debt */
  maxSelfDebtShare?: number;
  /** debt symbols counted as "self" for maxSelfDebtShare (default: the collateral asset only) */
  selfDebtSymbols?: readonly string[];
  selfDebtLabel?: string;
  /** drop positions with debt below this (dust) before the cap */
  minDebtUsd?: number;
  /** depth: only count pools whose other side is a USD stablecoin; read this many GeckoTerminal pages */
  depthStableOnly?: boolean;
  depthPages?: number;
};
// NOTE: as of block ~26.06M syrupUSDC is NOT listed on Aave V3 Ethereum Core (only syrupUSDT is), so
// the default run fails loudly by design.
const ASSETS = {
  syrupUSDC: {
    label: "syrupUSDC",
    members: [{ symbol: "syrupUSDC", address: "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b" }],
    syntheticId: 15,
    outFile: "eth-syrup.json",
    rawFile: "eth-syrup.raw.json",
  },
  syrupUSDT: {
    label: "syrupUSDT",
    members: [{ symbol: "syrupUSDT", address: "0x356B8d89c1e1239Cbbb9dE4815c39A1474d5BA7D" }],
    syntheticId: 15,
    outFile: "eth-syrupusdt.json",
    rawFile: "eth-syrupusdt.raw.json",
  },
  usde: {
    label: "USDe family (USDe / sUSDe)",
    members: [
      { symbol: "USDe", address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3" },
      { symbol: "sUSDe", address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497" },
    ],
    syntheticId: 14,
    outFile: "eth-usde.json",
    rawFile: "eth-usde.raw.json",
  },
  usdc: {
    label: "USDC",
    members: [{ symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }],
    syntheticId: 13,
    outFile: "eth-usdc.json",
    rawFile: "eth-usdc.raw.json",
    recentBlocks: 1_296_000, // ~180 days at 12s blocks
    maxSelfDebtShare: 0.1, // a USDC depeg moves both sides of a USDC->USDC loop; Kaskad keeps debt fixed in USD
  },
  weth: {
    label: "WETH",
    members: [{ symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" }],
    syntheticId: 7,
    outFile: "eth-weth.json",
    rawFile: "eth-weth.raw.json",
    recentBlocks: 648_000, // ~90 days at 12s blocks
    // "deposit ETH, borrow stables": an ETH price shock does not change the USD value of ETH-correlated debt
    // in reality, but Kaskad keeps debt fixed in USD, so ETH-on-ETH loops are excluded.
    maxSelfDebtShare: 0.1,
    selfDebtSymbols: ["WETH", "wstETH", "weETH", "rsETH", "cbETH", "rETH", "osETH", "ETHx", "ezETH", "tETH", "eETH", "pufETH", "mETH"],
    selfDebtLabel: "ETH-correlated",
    minDebtUsd: 100,
    depthStableOnly: true,
    depthPages: 3,
  },
} as const satisfies Record<string, AssetCfg>;
const assetArg = process.argv.includes("--asset") ? process.argv[process.argv.indexOf("--asset") + 1] : "syrupUSDC";
if (!(assetArg in ASSETS)) throw new Error("--asset must be one of: " + Object.keys(ASSETS).join(", "));
const ASSET: AssetCfg = ASSETS[assetArg as keyof typeof ASSETS];
const POOL_DEPLOY_BLOCK = 16_291_127; // Aave V3 Ethereum Pool deployment
const HYPERSYNC_ETH = "https://eth.hypersync.xyz";
const RPCS = ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"];

const SYNTHETIC_ID = ASSET.syntheticId;
const MAX_POSITIONS = 300;
const SUPPLY_EVENT_SIG = "Supply(address,address,address,uint256,uint16)";

const CFG_CHUNK = 300; // getUserConfiguration calls per multicall (cheap: one SLOAD each)
const USER_CHUNK = 20; // users per account-data multicall (2 calls each)
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
// Step 1: candidates via HyperSync (Supply logs whose reserve is one of the target members)

async function getCandidates(): Promise<{ candidates: Address[]; meta: Record<string, unknown> }> {
  const cachePath = path.join(DATA_DIR, ASSET.rawFile);
  if (process.argv.includes("--cached") && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as { candidates: Address[] } & Record<string, unknown>;
    console.log(`[1] using cached candidates: ${cached.candidates.length}`);
    const { candidates, ...meta } = cached;
    return { candidates, meta };
  }
  const topic0 = keccak256(toBytes(SUPPLY_EVENT_SIG));
  const topic1s = ASSET.members.map((m) => pad(m.address.toLowerCase() as Address, { size: 32 }).toLowerCase());
  console.log(`[1] HyperSync ${HYPERSYNC_ETH}: Supply logs on Pool ${ETH.POOL}, reserve in {${ASSET.members.map((m) => m.symbol).join(", ")}}`);
  const fromBlock = ASSET.recentBlocks ? Number(await client.getBlockNumber()) - ASSET.recentBlocks : POOL_DEPLOY_BLOCK;
  console.log(`[1] fromBlock ${fromBlock}${ASSET.recentBlocks ? ` (last ${ASSET.recentBlocks} blocks ~ ${Math.round((ASSET.recentBlocks * 12) / 86400)} days)` : " (Pool deployment)"}`);
  const res = await fetchLogs(
    { url: HYPERSYNC_ETH, address: [ETH.POOL], topic0, moreTopics: [topic1s], fromBlock },
    (p) => {
      if (p.pages % 10 === 0) console.log(`  page ${p.pages}: next_block=${p.nextBlock} / ${p.archiveHeight}, logs=${p.logs}`);
    },
  );
  const set = new Set<string>();
  const perMember: Record<string, number> = {};
  let wrongReserve = 0;
  for (const l of res.logs) {
    const idx = topic1s.indexOf((l.topics[1] ?? "").toLowerCase());
    if (idx < 0) {
      wrongReserve++;
      continue;
    }
    perMember[ASSET.members[idx].symbol] = (perMember[ASSET.members[idx].symbol] ?? 0) + 1;
    const t2 = l.topics[2];
    if (t2) set.add(getAddress(`0x${t2.slice(-40)}`));
  }
  if (wrongReserve) console.warn(`[1] WARNING: ${wrongReserve} logs with unexpected topic1 ignored`);
  const candidates = [...set].sort() as Address[];
  const firstBlock = res.logs.length ? res.logs.reduce((m, l) => Math.min(m, l.blockNumber), Infinity) : null;
  const lastBlock = res.logs.length ? res.logs.reduce((m, l) => Math.max(m, l.blockNumber), 0) : null;
  const meta = {
    generatedAt: new Date().toISOString(),
    chainId: 1,
    pool: ETH.POOL,
    event: SUPPLY_EVENT_SIG,
    reserveFilter: ASSET.members,
    archiveHeight: res.archiveHeight,
    fromBlock,
    supplyEvents: res.logs.length - wrongReserve,
    supplyEventsByMember: perMember,
    firstBlock,
    lastBlock,
    transport: res.transport,
  };
  console.log(
    `[1] ${meta.supplyEvents} Supply events (${JSON.stringify(perMember)}) in ${res.pages} pages via ${res.transport}; blocks ${firstBlock}..${lastBlock}; unique suppliers (onBehalfOf) = ${candidates.length}`,
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
const DEX = /curve|uniswap|fluid-dex|balancer|sushi|pancake|maverick|ekubo|dodo|solidly|bunni|elk|kyber|shadow|camelot|velodrome|aerodrome/i;

type DepthPool = { name: string; dex: string; reserveUsd: number; volume24hUsd: number; address: string };

const STABLES = new Set(["usdc", "usdt", "dai", "usds", "usde", "crvusd", "gho", "pyusd", "frax", "frxusd", "rlusd", "usdtb", "usd0", "lusd", "usdg", "susds", "sdai"]);
const otherSideIsStable = (name: string, self: string) =>
  name.split("/").map((t) => t.trim().split(" ")[0].toLowerCase()).some((t) => t !== self.toLowerCase() && STABLES.has(t));

async function fetchDepth(member: Member, exitNote: string) {
  const addr = member.address.toLowerCase();
  const pages = ASSET.depthPages ?? 1;
  const gtUrl = `https://api.geckoterminal.com/api/v2/networks/eth/tokens/${member.address}/pools?page=1${pages > 1 ? `..${pages}` : ""}`;
  let pools: DepthPool[] = [];
  let gtError: string | null = null;
  let nonStableSkipped: DepthPool[] = [];
  try {
    const raw: GtPool[] = [];
    for (let pg = 1; pg <= pages; pg++) {
      if (pg > 1) await sleep(2500);
      raw.push(...(await getJson<{ data: GtPool[] }>(`https://api.geckoterminal.com/api/v2/networks/eth/tokens/${member.address}/pools?page=${pg}`)).data);
    }
    const j = { data: raw.filter((p, i) => raw.findIndex((q) => q.attributes.address === p.attributes.address) === i) };
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
    if (ASSET.depthStableOnly) {
      nonStableSkipped = pools.filter((p) => !otherSideIsStable(p.name, member.symbol));
      pools = pools.filter((p) => otherSideIsStable(p.name, member.symbol));
    }
  } catch (e) {
    gtError = (e as Error).message;
    console.warn(`[4] GeckoTerminal failed: ${gtError}`);
  }
  let llamaNote = "";
  let llamaDexTvl = 0;
  try {
    const j = await getJson<{ data: LlamaPool[] }>("https://yields.llama.fi/pools");
    const eth = j.data.filter((p) => p.chain === "Ethereum" && (p.underlyingTokens ?? []).some((u) => u.toLowerCase() === addr));
    const dex = eth.filter((p) => DEX.test(p.project)).sort((a, b) => b.tvlUsd - a.tvlUsd);
    const other = eth.filter((p) => !DEX.test(p.project)).sort((a, b) => b.tvlUsd - a.tvlUsd);
    llamaDexTvl = dex.reduce((s, p) => s + p.tvlUsd, 0);
    llamaNote = dex.length
      ? ` DefiLlama (yields.llama.fi) Ethereum DEX pools containing ${member.symbol}: ${dex.length} pools, ${usd(llamaDexTvl)} total; top: ${dex.slice(0, 8).map((p) => `${p.project} ${p.symbol} ${usd(p.tvlUsd)}${p.poolMeta ? ` (${p.poolMeta})` : ""}`).join("; ")}.`
      : ` DefiLlama lists no Ethereum DEX pool with ${member.symbol} as underlying.`;
    if (other.length) llamaNote += ` Non-DEX venues using it (lending / Pendle / vaults; not spot exit liquidity): ${other.slice(0, 6).map((p) => `${p.project} ${usd(p.tvlUsd)}`).join("; ")}.`;
  } catch (e) {
    llamaNote = ` DefiLlama cross-check failed: ${(e as Error).message}.`;
  }
  // Sanity: a single GeckoTerminal pool larger than DefiLlama's whole DEX TVL for the token is a data error.
  const outliers = llamaDexTvl > 0 ? pools.filter((p) => p.reserveUsd > llamaDexTvl) : [];
  if (outliers.length) {
    console.warn(`[4] dropping ${outliers.length} GeckoTerminal outlier pool(s) > DefiLlama DEX TVL ${usd(llamaDexTvl)}: ${outliers.map((p) => `${p.name} @ ${p.dex} ${usd(p.reserveUsd)}`).join("; ")}`);
    pools = pools.filter((p) => !outliers.includes(p));
    llamaNote += ` Dropped as data error: ${outliers.map((p) => `${p.name} @ ${p.dex} (${p.address}) reported reserve_in_usd ${usd(p.reserveUsd)}`).join("; ")} (single pool larger than DefiLlama's entire Ethereum DEX TVL for the token, ${usd(llamaDexTvl)}).`;
  }
  const total = pools.reduce((s, p) => s + p.reserveUsd, 0);
  if (pools.length === 0) {
    return {
      depthUsd: 25_000_000,
      source: "assumption",
      isAssumption: true,
      note: `GeckoTerminal returned no Ethereum pool${gtError ? ` (${gtError})` : ""}; assumed $25,000,000.` + exitNote + llamaNote,
      pools,
      llamaDexTvl,
    };
  }
  return {
    depthUsd: total,
    source: gtUrl,
    isAssumption: false,
    note:
      `Sum of GeckoTerminal reserve_in_usd over ${pools.length} Ethereum DEX pool(s) (GeckoTerminal top-pools page(s) 1..${pages}); largest: ${pools[0].name} on ${pools[0].dex} (${usd(pools[0].reserveUsd)}). ` +
      `TVL proxy (both sides of each pool), not a slippage curve.` +
      (ASSET.depthStableOnly
        ? ` Only pools with a USD stablecoin on the other side are counted (read ${pages} GeckoTerminal page(s)); skipped ${nonStableSkipped.length} non-stable pools worth ${usd(nonStableSkipped.reduce((s, p) => s + p.reserveUsd, 0))} (largest: ${nonStableSkipped.slice(0, 3).map((p) => `${p.name} @ ${p.dex} ${usd(p.reserveUsd)}`).join("; ") || "none"}).`
        : "") +
      exitNote +
      llamaNote,
    pools,
    llamaDexTvl,
  };
}

async function exitNoteFor(member: Member): Promise<string> {
  if (member.symbol === "sUSDe") {
    const abi = parseAbi(["function cooldownDuration() view returns (uint24)"]);
    const [r] = await mc([{ address: member.address, abi, functionName: "cooldownDuration" }]);
    const secs = r.status === "success" ? Number(r.result as number) : null;
    const d = secs === null ? "unknown (cooldownDuration() call failed)" : `${secs}s = ${(secs / 86400).toFixed(2)} days (sUSDe.cooldownDuration() at the pinned block)`;
    return ` sUSDe unstaking requires a cooldown of ${d}, so a liquidator's immediate exit is the DEX market (or holding sUSDe).`;
  }
  if (member.symbol === "USDe") return " USDe primary redemption via Ethena is whitelisted (KYC'd minters only), so a liquidator's immediate exit is the DEX market.";
  if (member.symbol === "WETH") return " WETH unwraps 1:1 to ETH instantly; the liquidator must sell ETH for stablecoins, so the exit is the ETH/stable DEX market (plus CEXs, not counted).";
  if (member.symbol === "USDC") return " Primary USDC redemption goes through Circle (institutional accounts, not instant for a liquidator), so the immediate exit is the DEX market.";
  if (member.symbol.startsWith("syrup")) return " Excludes Maple's native withdrawal queue (not instant).";
  return "";
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

// bits 0,2,4,... of the user config bitmap = "borrowing reserve i"
const BORROW_MASK = BigInt("0x" + "5".repeat(64));

async function main() {
  const { candidates, meta } = await getCandidates();

  blockNumber = await client.getBlockNumber();
  console.log(`[2] pinned block ${blockNumber}`);
  const { provider, dataProvider, oracle } = await resolveAddresses();
  const reserves = await loadReserves(dataProvider, oracle);
  const targets = ASSET.members.map((m) => {
    const r = reserves.find((x) => x.address.toLowerCase() === m.address.toLowerCase());
    if (!r) throw new Error(`${m.symbol} ${m.address} is NOT in getReservesList of ${ETH.POOL}`);
    console.log(`[2] ${m.symbol} = reserve #${r.id} (${r.symbol}, ${r.decimals}dp, price ${r.price}, LT ${r.ltBps}, collateral ${r.collateralEnabled})`);
    return r;
  });
  const targetIds = new Set(targets.map((r) => r.id));
  const eModes = await loadEModes();
  const eModeById = new Map(eModes.map((e) => [e.id, e]));
  for (const t of targets) {
    const ems = eModes.filter((e) => inBitmap(e.collateralBitmap, t.id));
    console.log(`[2] eModes with ${t.symbol} as collateral: ${ems.map((e) => `${e.id}:${e.label}(LT ${e.ltBps}, bonus ${e.bonusRaw})`).join(", ") || "none"}`);
  }

  // cheap pre-filter on the configuration bitmap
  const cfgRes = await mcChunked(
    candidates.map((u) => ({ address: ETH.POOL, abi: poolAbi, functionName: "getUserConfiguration", args: [u] })),
    CFG_CHUNK,
    "user config",
  );
  const pre: { user: Address; config: bigint }[] = [];
  let cfgFailed = 0;
  candidates.forEach((user, i) => {
    const c = cfgRes[i];
    if (c.status !== "success") {
      cfgFailed++;
      return;
    }
    const config = (c.result as { data: bigint }).data;
    if ((config & BORROW_MASK) !== 0n && targets.some((t) => isCollateral(config, t.id))) pre.push({ user, config });
  });
  if (cfgFailed) console.warn(`[2] WARNING: ${cfgFailed} getUserConfiguration calls failed`);
  console.log(`[2] ${candidates.length} candidates -> ${pre.length} borrow something AND have a target enabled as collateral`);

  const acctRes = await mcChunked(
    pre.flatMap((p) => [
      { address: ETH.POOL, abi: poolAbi, functionName: "getUserAccountData", args: [p.user] },
      { address: ETH.POOL, abi: poolAbi, functionName: "getUserEMode", args: [p.user] },
    ]),
    USER_CHUNK * 2,
    "account data",
  );
  const accounts: AccountData[] = [];
  let failed = 0;
  pre.forEach((p, i) => {
    const [a, e] = [acctRes[i * 2], acctRes[i * 2 + 1]];
    if (a.status !== "success" || e.status !== "success") {
      failed++;
      return;
    }
    const ad = a.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    accounts.push({ user: p.user, totalCollateralBase: ad[0], totalDebtBase: ad[1], healthFactor: ad[5], eMode: Number(e.result as bigint), config: p.config });
  });
  if (failed) console.warn(`[2] WARNING: ${failed} users had failed account-data calls`);
  const relevant = accounts.filter((a) => a.totalDebtBase > 0n);
  console.log(`[2] ${accounts.length} accounts read, ${relevant.length} with debt > 0`);

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

  // Step 3: normalize (identical rules to fetch-positions.ts), grouped by dominant target member
  type Pos = Record<string, unknown> & { debtUsd: number; collateralUsd: number; otherCollateralUsd: number; hfOnchain: number | null; ltBps: number; bonusBps: number; eMode: number };
  const byMember = new Map<number, { pos: Pos[]; hfDiffModel: number[]; hfDiffExact: number[]; collDiff: number[] }>(targets.map((t) => [t.id, { pos: [], hfDiffModel: [], hfDiffExact: [], collDiff: [] }]));
  const otherDominant = new Map<string, number>();
  const selfDebtExcluded = { positions: 0, debtUsd: 0, collateralUsd: 0 };
  const selfSyms = new Set((ASSET.selfDebtSymbols ?? []).map((x) => x.toLowerCase()));
  const selfDebtOf = (dba: Record<string, number>, domId: number) =>
    Object.entries(dba).reduce((s, [id, v]) => s + ((selfSyms.size ? selfSyms.has(reserves[+id].symbol.toLowerCase()) : +id === domId) ? v : 0), 0);
  const selfDebtIds = selfSyms.size ? reserves.filter((r) => selfSyms.has(r.symbol.toLowerCase())).map((r) => `${r.id}:${r.symbol}`) : [];

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
    if (!targetIds.has(dom.id)) {
      const s = reserves[dom.id].symbol;
      otherDominant.set(s, (otherDominant.get(s) ?? 0) + 1);
      return;
    }
    const bucket = byMember.get(dom.id)!;
    const debtUsd = Number(acc.totalDebtBase) / BASE;
    const debtByAsset: Record<string, number> = {};
    for (const [id, raw] of debt[u]) if (raw > 0n) debtByAsset[id] = round2(toUsd(raw, reserves[id].price, reserves[id].decimals));
    const otherUsd = collUsd.slice(1).reduce((s, c) => s + c.usd, 0);
    if (ASSET.maxSelfDebtShare !== undefined && debtUsd > 0 && selfDebtOf(debtByAsset, dom.id) / debtUsd >= ASSET.maxSelfDebtShare) {
      selfDebtExcluded.positions++;
      selfDebtExcluded.debtUsd += debtUsd;
      selfDebtExcluded.collateralUsd += dom.usd + otherUsd;
      return;
    }
    const { lt, bonus } = ltFor(dom.id);
    const hfOnchain = acc.healthFactor >= 2n ** 255n ? Infinity : Number((acc.healthFactor * 1_000_000n) / WAD) / 1e6;
    const hfModel = debtUsd > 0 ? ((dom.usd + otherUsd) * lt) / 1e4 / debtUsd : Infinity;
    const hfExact = debtUsd > 0 ? collUsd.reduce((s, c) => s + c.usd * ltFor(c.id).lt, 0) / 1e4 / debtUsd : Infinity;
    if (Number.isFinite(hfOnchain)) {
      bucket.hfDiffModel.push(Math.abs(hfModel - hfOnchain));
      bucket.hfDiffExact.push(Math.abs(hfExact - hfOnchain));
    }
    const onchainColl = Number(acc.totalCollateralBase) / BASE;
    if (onchainColl > 0) bucket.collDiff.push(Math.abs(dom.usd + otherUsd - onchainColl) / onchainColl);

    bucket.pos.push({
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

  const sumDebt = (ps: Pos[]) => ps.reduce((s, p) => s + p.debtUsd, 0);
  const sumColl = (ps: Pos[]) => ps.reduce((s, p) => s + p.collateralUsd + p.otherCollateralUsd, 0);
  const familyBreakdown = Object.fromEntries(
    targets.map((t) => {
      const ps = byMember.get(t.id)!.pos;
      return [t.symbol, { ethReserveId: t.id, positions: ps.length, collateralUsd: round2(sumColl(ps)), debtUsd: round2(sumDebt(ps)) }];
    }),
  );
  // Family collapsing into ONE synthetic asset is not clean (one price / one raw unit per position), so
  // for a multi-member family we keep only the member that backs the most debt.
  const chosen = targets.reduce((best, t) => (sumDebt(byMember.get(t.id)!.pos) > sumDebt(byMember.get(best.id)!.pos) ? t : best), targets[0]);
  const chosenMember = ASSET.members[targets.indexOf(chosen)];
  const { hfDiffModel, hfDiffExact, collDiff } = byMember.get(chosen.id)!;
  const all = byMember.get(chosen.id)!.pos.sort((a, b) => b.debtUsd - a.debtUsd);
  const excludedFamily = targets.filter((t) => t !== chosen);
  for (const t of excludedFamily) console.log(`[3] family member ${t.symbol}: ${byMember.get(t.id)!.pos.length} dominant positions, debt ${usd(sumDebt(byMember.get(t.id)!.pos))} -> excluded (chosen ${chosen.symbol})`);

  const minDebt = ASSET.minDebtUsd ?? 0;
  const dust = all.filter((p) => p.debtUsd < minDebt);
  const eligible = all.filter((p) => p.debtUsd >= minDebt);
  const positions = eligible.slice(0, MAX_POSITIONS);
  const dropped = eligible.length - positions.length;
  const allDebt = sumDebt(all);
  const allColl = sumColl(all);
  const keptDebt = sumDebt(positions);
  const keptDomColl = positions.reduce((s, p) => s + p.collateralUsd, 0);
  const keptColl = sumColl(positions);
  const keptShare = allDebt > 0 ? keptDebt / allDebt : 1;

  const ltUsed = [...new Set(positions.map((p) => p.ltBps))].sort((a, b) => a - b);
  const eModeUsed = new Map<number, number>();
  for (const p of positions) eModeUsed.set(p.eMode, (eModeUsed.get(p.eMode) ?? 0) + 1);
  const hfs = positions.map((p) => p.hfOnchain).filter((x): x is number => x !== null);
  const combo = new Map<string, { n: number; debt: number }>();
  for (const p of positions) {
    const k = `eMode ${p.eMode} (${eModeById.get(p.eMode)?.label ?? "none"}) LT ${p.ltBps} bonus ${p.bonusBps}`;
    const c = combo.get(k) ?? { n: 0, debt: 0 };
    combo.set(k, { n: c.n + 1, debt: c.debt + p.debtUsd });
  }
  const ltBreakdown = [...combo.entries()].sort((a, b) => b[1].debt - a[1].debt).map(([k, v]) => ({ params: k, positions: v.n, debtUsd: round2(v.debt) }));

  const exitNote = await exitNoteFor(chosenMember);
  const depth = await fetchDepth(chosenMember, exitNote);

  const usedIds = new Set<number>(targets.map((t) => t.id));
  for (const p of positions) for (const k of Object.keys(p.debtByAsset as object)) usedIds.add(+k);
  const eModesOut = eModes
    .filter((e) => eModeUsed.has(e.id) || inBitmap(e.collateralBitmap, chosen.id))
    .map((e) => ({
      id: e.id,
      label: e.label,
      ltvBps: e.ltvBps,
      ltBps: e.ltBps,
      bonusBps: extraBonus(e.bonusRaw),
      collateralBitmap: e.collateralBitmap.toString(),
      borrowableBitmap: e.borrowableBitmap.toString(),
      assetIsCollateral: inBitmap(e.collateralBitmap, chosen.id),
      keptPositions: eModeUsed.get(e.id) ?? 0,
    }));

  const suppliedUsd = round2(toUsd(chosen.totalSupplied, chosen.price, chosen.decimals));
  const familyNote =
    targets.length > 1
      ? ` Family ${ASSET.label}: dominant-collateral breakdown ${targets.map((t) => `${t.symbol} ${familyBreakdown[t.symbol].positions} pos / ${usd(familyBreakdown[t.symbol].debtUsd)} debt`).join(", ")}. ` +
        `Collapsing the family into one synthetic asset would need one price and one raw unit per position, so only the member backing more debt (${chosen.symbol}) is kept; positions dominated by ${excludedFamily.map((t) => t.symbol).join("/")} are excluded (see totals.familyBreakdown).`
      : "";
  const out = {
    generatedAt: new Date().toISOString(),
    chainId: 1,
    block: Number(blockNumber),
    source: "aave-v3-ethereum-core",
    addresses: { pool: ETH.POOL, poolAddressesProvider: provider, dataProvider, oracle, asset: chosen.address },
    notes: {
      scope:
        `Aave V3 Ethereum Core borrowers (debt > 0) whose dominant collateral (largest USD among collateral-enabled aToken balances) is ${chosen.symbol}. ` +
        `Candidates = unique onBehalfOf of Pool Supply events with reserve in {${ASSET.members.map((m) => m.symbol).join(", ")}} (HyperSync, blocks ${meta.firstBlock}..${meta.lastBlock}), ` +
        `pre-filtered by getUserConfiguration (borrowing any reserve AND a target enabled as collateral). Holders who only received the aToken by transfer are not covered.` +
        (ASSET.recentBlocks
          ? ` Candidate window limited to the last ${ASSET.recentBlocks} blocks (~${Math.round((ASSET.recentBlocks * 12) / 86400)} days, from block ${meta.fromBlock}) because the full Supply history is very large; positions whose owner has not supplied ${ASSET.members[0].symbol} in that window are missed.`
          : "") +
        familyNote,
      ...(ASSET.maxSelfDebtShare !== undefined
        ? {
            selfDebtFilter: `Excluded ${selfDebtExcluded.positions} ${chosen.symbol}-dominant positions (debt ${usd(selfDebtExcluded.debtUsd)}, collateral ${usd(selfDebtExcluded.collateralUsd)}) whose ${ASSET.selfDebtLabel ? `${ASSET.selfDebtLabel} (reserves ${selfDebtIds.join(", ")})` : chosen.symbol} debt is >= ${ASSET.maxSelfDebtShare * 100}% of their total debt: Kaskad shocks the collateral price with debt fixed in USD, but a ${chosen.symbol} price move would move both sides of such a loop. Nothing else is subtracted.`,
          }
        : {}),
      syntheticId: `collateralId is the synthetic Kaskad id ${SYNTHETIC_ID} ("${chosen.symbol} on Ethereum") for every position; the real Aave Ethereum reserve index is ethReserveId (${chosen.id}). debtByAsset keys are Ethereum reserve indices (see ethReserves).`,
      cap: `${minDebt > 0 ? `Dropped ${dust.length} dust positions with debt < ${usd(minDebt)} (total debt ${usd(sumDebt(dust))}) first. ` : ""}Kept the top ${positions.length} of ${eligible.length} ${chosen.symbol}-dominant positions by debtUsd; dropped ${dropped}. Kept positions hold ${(keptShare * 100).toFixed(2)}% of the ${chosen.symbol}-dominant debt (${usd(keptDebt)} of ${usd(allDebt)}).`,
      hfModel:
        "hfModel = (collateralUsd + otherCollateralUsd) * ltBps / 1e4 / debtUsd, i.e. the dominant collateral's LT applied to ALL collateral (MVP approximation). hfOnchain = Pool.getUserAccountData.healthFactor / 1e18.",
      ltRule:
        "ltBps/bonusBps: eMode category values if user eMode > 0 and dominant asset is in the category collateralBitmap (aave-v3-origin GenericLogic/LiquidationLogic), else reserve values. bonusBps is the extra part (10400 -> 400). See totals.ltBreakdown.",
      totals: `totals.collateralUsd/debtUsd are over the kept positions (collateralUsd includes otherCollateralUsd; byAsset collateralUsd = dominant collateral only). totals.reserveSuppliedUsd = ${chosen.symbol} aToken totalSupply on Aave Ethereum Core (all suppliers); reserveDebtUsd = 0 (not used by the consumer). totals.all* = before the cap.`,
      depth: `depth = Ethereum DEX exit liquidity for ${chosen.symbol} (GeckoTerminal reserve_in_usd sum, TVL proxy) with DefiLlama cross-check, same format as data/depth.json entries.`,
    },
    reserves: [
      {
        id: SYNTHETIC_ID,
        symbol: `${chosen.symbol} (Ethereum)`,
        address: chosen.address,
        decimals: chosen.decimals,
        priceUsd8: chosen.price.toString(),
        ltBps: chosen.ltBps,
        ltvBps: chosen.ltvBps,
        bonusBps: extraBonus(chosen.bonusRaw),
        totalSupplied: chosen.totalSupplied.toString(),
        totalDebt: "0",
        suppliedUsd,
        debtUsd: 0,
        ethReserveId: chosen.id,
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
      reserveSuppliedUsd: suppliedUsd,
      reserveDebtUsd: 0,
      candidates: candidates.length,
      candidatesPrefiltered: pre.length,
      candidatesWithDebt: relevant.length,
      chosenMember: chosen.symbol,
      familyBreakdown,
      dominantAll: all.length,
      dustDropped: minDebt > 0 ? { minDebtUsd: minDebt, positions: dust.length, debtUsd: round2(sumDebt(dust)) } : null,
      dropped,
      allCollateralUsd: round2(allColl),
      allDebtUsd: round2(allDebt),
      keptDebtShare: round6(keptShare),
      selfDebtExcluded: ASSET.maxSelfDebtShare !== undefined ? { maxSelfDebtShare: ASSET.maxSelfDebtShare, debtAssets: selfDebtIds.length ? selfDebtIds : [chosen.symbol], positions: selfDebtExcluded.positions, debtUsd: round2(selfDebtExcluded.debtUsd), collateralUsd: round2(selfDebtExcluded.collateralUsd) } : null,
      otherDominantCollateral: Object.fromEntries([...otherDominant.entries()].sort((a, b) => b[1] - a[1])),
      ltBreakdown,
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
  console.log(`candidates ${candidates.length} | prefiltered ${pre.length} | with debt ${relevant.length} | family ${JSON.stringify(familyBreakdown)}`);
  if (ASSET.maxSelfDebtShare !== undefined) console.log(`self-debt filter: excluded ${selfDebtExcluded.positions} positions, debt ${usd(selfDebtExcluded.debtUsd)}`);
  console.log(`chosen ${chosen.symbol} (#${chosen.id}) -> id ${SYNTHETIC_ID} | dominant ${all.length} | kept ${positions.length} | dropped ${dropped}`);
  console.log(`other dominant collateral (top): ${[...otherDominant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => `${s}:${n}`).join(", ") || "none"}`);
  console.log(`kept: collateral ${usd(keptColl)} (${chosen.symbol} ${usd(keptDomColl)}) | debt ${usd(keptDebt)} | ${(keptShare * 100).toFixed(2)}% of dominant debt ${usd(allDebt)}`);
  console.log(`${chosen.symbol} reserve supplied ${usd(suppliedUsd)}; price ${Number(chosen.price) / 1e8}`);
  for (const l of ltBreakdown) console.log(`  ${l.params}: ${l.positions} pos, debt ${usd(l.debtUsd)}`);
  console.log(
    `HF onchain: min ${Math.min(...hfs).toFixed(4)} | median ${median(hfs).toFixed(4)} | <1.00 ${hfs.filter((h) => h < 1).length} | <1.02 ${hfs.filter((h) => h < 1.02).length} | <1.05 ${hfs.filter((h) => h < 1.05).length} | <1.10 ${hfs.filter((h) => h < 1.1).length}`,
  );
  const debtUnder = (x: number) => usd(positions.filter((p) => p.hfOnchain !== null && p.hfOnchain < x).reduce((s, p) => s + p.debtUsd, 0));
  console.log(`debt with HF<1.02 ${debtUnder(1.02)} | HF<1.05 ${debtUnder(1.05)} | HF<1.10 ${debtUnder(1.1)} | HF<1.20 ${debtUnder(1.2)}`);
  const share = (x: number) => ((positions.filter((p) => p.hfOnchain !== null && p.hfOnchain < x).reduce((s, p) => s + p.debtUsd, 0) / keptDebt) * 100).toFixed(1) + "%";
  console.log(`debt share with HF<1.05 ${share(1.05)} | HF<1.10 ${share(1.1)} | HF<1.20 ${share(1.2)} | <1.20 count ${hfs.filter((h) => h < 1.2).length}`);
  if (minDebt > 0) console.log(`dust dropped: ${dust.length} positions < ${usd(minDebt)}`);
  console.log(`HF |model - onchain|: median ${median(hfDiffModel).toFixed(6)}, p90 ${quantile(hfDiffModel, 0.9).toFixed(4)}, max ${Math.max(...hfDiffModel).toFixed(4)}`);
  console.log(`HF |exact-rule - onchain|: median ${median(hfDiffExact).toExponential(2)}, max ${Math.max(...hfDiffExact).toExponential(2)}`);
  console.log(`collateral USD rel diff vs on-chain: median ${median(collDiff).toExponential(2)}, max ${Math.max(...collDiff).toExponential(2)}`);
  console.log(`depth ${usd(depth.depthUsd)} (${depth.isAssumption ? "ASSUMPTION" : "measured"}); DefiLlama DEX TVL ${usd(depth.llamaDexTvl)}`);
  for (const p of depth.pools) console.log(`  ${p.name} @ ${p.dex}: ${usd(p.reserveUsd)} (24h vol ${usd(p.volume24hUsd)})`);
  console.log(`exit note:${exitNote}`);
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error("FAILED:", redact((e as Error).message.split("\n").slice(0, 3).join(" | ")));
  process.exit(1);
});
