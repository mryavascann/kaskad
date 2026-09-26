/**
 * Kaskad data pipeline, step 1-3.
 *
 *  1. All historical Aave V3 Borrow events on Monad mainnet via Envio HyperSync -> unique borrowers
 *     (borrower = onBehalfOf = topic2).
 *  2. Current on-chain state (single pinned block) via Multicall3: account data, eMode, user config
 *     bitmap, aToken / variableDebtToken balances, oracle prices, reserve + eMode config.
 *  3. Normalize to one "dominant collateral" position per borrower -> data/positions.json
 *
 * READ-ONLY: only eth_call / eth_blockNumber are used. Never sends transactions.
 *
 * Usage: npm run fetch            (re-queries HyperSync)
 *        npm run fetch -- --cached (reuse data/borrowers.raw.json)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getAddress, keccak256, toBytes, type Address } from "viem";
import { DATA_DIR } from "./lib/env.js";
import { ADDR, makeClient, redact } from "./lib/chain.js";
import { poolAbi, dataProviderAbi, oracleAbi, erc20Abi, BORROW_EVENT_SIG } from "./lib/abis.js";
import { fetchLogs, sleep } from "./lib/hypersync.js";

const t0 = Date.now();
const client = makeClient();
mkdirSync(DATA_DIR, { recursive: true });

const USER_CHUNK = 40; // users per account-data multicall (3 calls each)
const BAL_CALL_CHUNK = 300; // calls per balance multicall
const CONCURRENCY = 2; // parallel RPC requests (gentle on Alchemy CU budget)
const PAUSE_MS = 150;

const BASE = 1e8; // Aave oracle base currency unit (USD, 8 decimals) - verified live below
const WAD = 10n ** 18n;

// ---------------------------------------------------------------------------------------------
// helpers

type Call = { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] };
type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

let rpcRequests = 0;
let blockNumber: bigint | undefined;

/** Multicall with pinned block, allowFailure, and split-on-error retry. */
async function mc(calls: Call[]): Promise<CallResult[]> {
  if (calls.length === 0) return [];
  try {
    rpcRequests++;
    const res = await client.multicall({
      contracts: calls as never,
      allowFailure: true,
      blockNumber,
      batchSize: 0, // we control chunking ourselves; 0 = no viem-side splitting
    });
    return res as CallResult[];
  } catch (e) {
    if (calls.length <= 5) throw e;
    console.warn(`  multicall of ${calls.length} failed (${redact((e as Error).message.split("\n")[0].slice(0, 120))}); splitting`);
    await sleep(1000);
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

/** raw token amount * price(8dp) / 10^decimals -> USD float, computed in bigint to keep precision */
function toUsd(raw: bigint, priceUsd8: bigint, decimals: number): number {
  const base = (raw * priceUsd8) / 10n ** BigInt(decimals); // base-currency units (8dp), same as Aave
  return Number(base) / BASE;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

// ---------------------------------------------------------------------------------------------
// Step 1: borrowers via HyperSync

async function getBorrowers(): Promise<Address[]> {
  const cachePath = path.join(DATA_DIR, "borrowers.raw.json");
  if (process.argv.includes("--cached") && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as { borrowers: Address[] };
    console.log(`[1] using cached borrowers: ${cached.borrowers.length}`);
    return cached.borrowers;
  }
  const topic0 = keccak256(toBytes(BORROW_EVENT_SIG));
  console.log(`[1] HyperSync: Borrow logs on Pool ${ADDR.POOL} (topic0 ${topic0})`);
  const res = await fetchLogs({ address: [ADDR.POOL], topic0, fromBlock: 0 }, (p) => {
    if (p.pages % 5 === 0) console.log(`  page ${p.pages}: next_block=${p.nextBlock} / ${p.archiveHeight}, logs=${p.logs}`);
  });
  const set = new Set<string>();
  for (const l of res.logs) {
    const t2 = l.topics[2];
    if (!t2) continue;
    set.add(getAddress(`0x${t2.slice(-40)}`));
  }
  const borrowers = [...set].sort() as Address[];
  const firstBlock = res.logs.length ? Math.min(...res.logs.map((l) => l.blockNumber)) : null;
  const lastBlock = res.logs.length ? Math.max(...res.logs.map((l) => l.blockNumber)) : null;
  console.log(
    `[1] ${res.logs.length} Borrow events in ${res.pages} pages via ${res.transport}; archive height ${res.archiveHeight}; ` +
      `blocks ${firstBlock}..${lastBlock}; unique borrowers (onBehalfOf) = ${borrowers.length}`,
  );
  writeFileSync(
    cachePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        chainId: 143,
        pool: ADDR.POOL,
        event: BORROW_EVENT_SIG,
        archiveHeight: res.archiveHeight,
        borrowEvents: res.logs.length,
        firstBlock,
        lastBlock,
        transport: res.transport,
        borrowers,
      },
      null,
      1,
    ),
  );
  return borrowers;
}

// ---------------------------------------------------------------------------------------------
// Step 2a: reserves & eModes

interface Reserve {
  id: number;
  symbol: string;
  address: Address;
  decimals: number;
  price: bigint;
  ltBps: number;
  ltvBps: number;
  bonusRaw: number;
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

async function loadReserves(): Promise<Reserve[]> {
  const [listR, unitR] = await mc([
    { address: ADDR.POOL, abi: poolAbi, functionName: "getReservesList" },
    { address: ADDR.ORACLE, abi: oracleAbi, functionName: "BASE_CURRENCY_UNIT" },
  ]);
  const list = ok<Address[]>(listR, "getReservesList");
  const unit = ok<bigint>(unitR, "BASE_CURRENCY_UNIT");
  if (unit !== 100000000n) throw new Error(`unexpected oracle BASE_CURRENCY_UNIT ${unit}`);

  const calls: Call[] = [{ address: ADDR.ORACLE, abi: oracleAbi, functionName: "getAssetsPrices", args: [list] }];
  for (const a of list) {
    calls.push({ address: a, abi: erc20Abi, functionName: "symbol" });
    calls.push({ address: ADDR.DATA_PROVIDER, abi: dataProviderAbi, functionName: "getReserveConfigurationData", args: [a] });
    calls.push({ address: ADDR.DATA_PROVIDER, abi: dataProviderAbi, functionName: "getReserveTokensAddresses", args: [a] });
  }
  const r = await mc(calls);
  const prices = ok<bigint[]>(r[0], "getAssetsPrices");
  const partial = list.map((address, id) => {
    const symbol = ok<string>(r[1 + id * 3], `symbol ${address}`);
    const cfg = ok<readonly [bigint, bigint, bigint, bigint, ...unknown[]]>(r[2 + id * 3], `cfg ${address}`);
    const toks = ok<readonly [Address, Address, Address]>(r[3 + id * 3], `tokens ${address}`);
    return {
      id,
      symbol,
      address,
      decimals: Number(cfg[0]),
      ltvBps: Number(cfg[1]),
      ltBps: Number(cfg[2]),
      bonusRaw: Number(cfg[3]),
      price: prices[id],
      aToken: toks[0],
      vToken: toks[2],
    };
  });
  const sup = await mc(
    partial.flatMap((p) => [
      { address: p.aToken, abi: erc20Abi, functionName: "totalSupply" },
      { address: p.vToken, abi: erc20Abi, functionName: "totalSupply" },
    ]),
  );
  return partial.map((p, i) => ({
    ...p,
    totalSupplied: ok<bigint>(sup[i * 2], `aToken totalSupply ${p.symbol}`),
    totalDebt: ok<bigint>(sup[i * 2 + 1], `vToken totalSupply ${p.symbol}`),
  }));
}

async function loadEModes(): Promise<EMode[]> {
  // Probe ids 1..32 in one go; keep any category with a label or non-zero LT.
  const ids = Array.from({ length: 32 }, (_, i) => i + 1);
  const r = await mc(
    ids.flatMap((id) => [
      { address: ADDR.POOL, abi: poolAbi, functionName: "getEModeCategoryLabel", args: [id] },
      { address: ADDR.POOL, abi: poolAbi, functionName: "getEModeCategoryCollateralConfig", args: [id] },
      { address: ADDR.POOL, abi: poolAbi, functionName: "getEModeCategoryCollateralBitmap", args: [id] },
      { address: ADDR.POOL, abi: poolAbi, functionName: "getEModeCategoryBorrowableBitmap", args: [id] },
    ]),
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
// main

interface AccountData {
  user: Address;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  ltBase: bigint; // currentLiquidationThreshold (bps)
  healthFactor: bigint;
  eMode: number;
  config: bigint;
}

const isBorrowing = (cfg: bigint, i: number) => ((cfg >> BigInt(2 * i)) & 1n) === 1n;
const isCollateral = (cfg: bigint, i: number) => ((cfg >> BigInt(2 * i + 1)) & 1n) === 1n;
const inBitmap = (bm: bigint, i: number) => ((bm >> BigInt(i)) & 1n) === 1n;
const extraBonus = (raw: number) => (raw > 10000 ? raw - 10000 : 0);

async function main() {
  const borrowers = await getBorrowers();

  blockNumber = await client.getBlockNumber();
  console.log(`[2] pinned block ${blockNumber}`);

  const reserves = await loadReserves();
  const eModes = await loadEModes();
  console.log(`[2] ${reserves.length} reserves: ${reserves.map((r) => `${r.id}:${r.symbol}`).join(", ")}`);
  console.log(`[2] eModes: ${eModes.map((e) => `${e.id}:${e.label}(LT ${e.ltBps})`).join(", ")}`);
  const eModeById = new Map(eModes.map((e) => [e.id, e]));

  // account data for every borrower
  const acctCalls: Call[] = borrowers.flatMap((u) => [
    { address: ADDR.POOL, abi: poolAbi, functionName: "getUserAccountData", args: [u] },
    { address: ADDR.POOL, abi: poolAbi, functionName: "getUserEMode", args: [u] },
    { address: ADDR.POOL, abi: poolAbi, functionName: "getUserConfiguration", args: [u] },
  ]);
  const acctRes = await mcChunked(acctCalls, USER_CHUNK * 3, "account data");
  const accounts: AccountData[] = [];
  let failed = 0;
  borrowers.forEach((user, i) => {
    const [a, e, c] = [acctRes[i * 3], acctRes[i * 3 + 1], acctRes[i * 3 + 2]];
    if (a.status !== "success" || e.status !== "success" || c.status !== "success") {
      failed++;
      return;
    }
    const ad = a.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    accounts.push({
      user,
      totalCollateralBase: ad[0],
      totalDebtBase: ad[1],
      ltBase: ad[3],
      healthFactor: ad[5],
      eMode: Number(e.result as bigint),
      config: (c.result as { data: bigint }).data,
    });
  });
  if (failed) console.warn(`[2] WARNING: ${failed} users had failed account-data calls`);
  const withDebt = accounts.filter((a) => a.totalDebtBase > 0n);
  console.log(`[2] ${accounts.length} accounts read, ${withDebt.length} with debt > 0`);

  // per-reserve balances for users with debt (only where the config bit is set)
  type BalRef = { u: number; reserve: number; kind: "a" | "v" };
  const balRefs: BalRef[] = [];
  const balCalls: Call[] = [];
  withDebt.forEach((acc, u) => {
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
  const coll: Map<number, bigint>[] = withDebt.map(() => new Map());
  const debt: Map<number, bigint>[] = withDebt.map(() => new Map());
  balRefs.forEach((ref, i) => {
    const v = ok<bigint>(balRes[i], `balanceOf ${ref.kind} ${ref.reserve} ${withDebt[ref.u].user}`);
    (ref.kind === "a" ? coll : debt)[ref.u].set(ref.reserve, v);
  });

  // ------------------------------------------------------------------------------------------
  // Step 3: normalize
  const positions: Record<string, unknown>[] = [];
  const hfDiffModel: number[] = [];
  const hfDiffExact: number[] = [];
  const collDiff: number[] = [];
  let noCollateral = 0;
  let noCollateralDebtUsd = 0;
  let dominantInEMode = 0;

  withDebt.forEach((acc, u) => {
    const em = acc.eMode > 0 ? eModeById.get(acc.eMode) : undefined;
    const ltFor = (id: number) =>
      em && inBitmap(em.collateralBitmap, id) ? { lt: em.ltBps, bonus: em.bonusRaw, emode: true } : { lt: reserves[id].ltBps, bonus: reserves[id].bonusRaw, emode: false };

    const collUsd = [...coll[u].entries()]
      .map(([id, raw]) => ({ id, raw, usd: toUsd(raw, reserves[id].price, reserves[id].decimals) }))
      .filter((c) => c.raw > 0n)
      .sort((a, b) => b.usd - a.usd);
    const debtUsd = Number(acc.totalDebtBase) / BASE;
    const debtByAsset: Record<string, number> = {};
    for (const [id, raw] of debt[u]) if (raw > 0n) debtByAsset[id] = round2(toUsd(raw, reserves[id].price, reserves[id].decimals));

    if (collUsd.length === 0) {
      noCollateral++;
      noCollateralDebtUsd += debtUsd;
      return;
    }
    const dom = collUsd[0];
    const otherUsd = collUsd.slice(1).reduce((s, c) => s + c.usd, 0);
    const { lt, bonus, emode } = ltFor(dom.id);
    if (emode) dominantInEMode++;

    const hfOnchain = acc.healthFactor >= 2n ** 255n ? Infinity : Number((acc.healthFactor * 1_000_000n) / WAD) / 1e6;
    const hfModel = debtUsd > 0 ? ((dom.usd + otherUsd) * lt) / 1e4 / debtUsd : Infinity;
    // exact v3.2+ rule (per-reserve LT), used only to validate our data vs on-chain HF
    const hfExact = debtUsd > 0 ? collUsd.reduce((s, c) => s + c.usd * ltFor(c.id).lt, 0) / 1e4 / debtUsd : Infinity;
    if (Number.isFinite(hfOnchain)) {
      hfDiffModel.push(Math.abs(hfModel - hfOnchain));
      hfDiffExact.push(Math.abs(hfExact - hfOnchain));
    }
    const onchainColl = Number(acc.totalCollateralBase) / BASE;
    if (onchainColl > 0) collDiff.push(Math.abs(dom.usd + otherUsd - onchainColl) / onchainColl);

    positions.push({
      user: acc.user,
      eMode: acc.eMode,
      collateralId: dom.id,
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
  positions.sort((a, b) => (b.debtUsd as number) - (a.debtUsd as number));

  // totals
  const byAsset: Record<string, { positions: number; collateralUsd: number; debtUsd: number; ltBpsUsed: number[] }> = {};
  let totColl = 0;
  let totDebt = 0;
  for (const p of positions) {
    const id = String(p.collateralId);
    byAsset[id] ??= { positions: 0, collateralUsd: 0, debtUsd: 0, ltBpsUsed: [] };
    byAsset[id].positions++;
    byAsset[id].collateralUsd += p.collateralUsd as number;
    byAsset[id].debtUsd += p.debtUsd as number;
    if (!byAsset[id].ltBpsUsed.includes(p.ltBps as number)) byAsset[id].ltBpsUsed.push(p.ltBps as number);
    totColl += (p.collateralUsd as number) + (p.otherCollateralUsd as number);
    totDebt += p.debtUsd as number;
  }
  for (const v of Object.values(byAsset)) {
    v.collateralUsd = round2(v.collateralUsd);
    v.debtUsd = round2(v.debtUsd);
    v.ltBpsUsed.sort((a, b) => a - b);
  }

  const reservesOut = reserves.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    address: r.address,
    decimals: r.decimals,
    priceUsd8: r.price.toString(),
    ltBps: r.ltBps,
    ltvBps: r.ltvBps,
    bonusBps: extraBonus(r.bonusRaw),
    totalSupplied: r.totalSupplied.toString(),
    totalDebt: r.totalDebt.toString(),
    suppliedUsd: round2(toUsd(r.totalSupplied, r.price, r.decimals)),
    debtUsd: round2(toUsd(r.totalDebt, r.price, r.decimals)),
  }));
  const reserveSuppliedUsd = round2(reservesOut.reduce((s, r) => s + r.suppliedUsd, 0));
  const reserveDebtUsd = round2(reservesOut.reduce((s, r) => s + r.debtUsd, 0));

  const out = {
    generatedAt: new Date().toISOString(),
    chainId: 143,
    block: Number(blockNumber),
    source: "aave-v3-monad-mainnet",
    notes: {
      hfModel:
        "hfModel = (collateralUsd + otherCollateralUsd) * ltBps / 1e4 / debtUsd, i.e. the dominant collateral's LT applied to ALL collateral (MVP approximation). hfOnchain = Pool.getUserAccountData.healthFactor / 1e18.",
      ltRule:
        "ltBps/bonusBps: eMode category values if user eMode > 0 and dominant asset is in the category collateralBitmap (aave-v3-origin GenericLogic/LiquidationLogic), else reserve values. bonusBps is the extra part (10400 -> 400).",
      totals:
        "totals.collateralUsd/debtUsd/byAsset are borrower-level (positions below; byAsset keyed by dominant collateral id, collateralUsd = dominant collateral only). totals.reserveSuppliedUsd/reserveDebtUsd are protocol-wide from aToken/variableDebtToken totalSupply (includes non-borrowing suppliers).",
    },
    reserves: reservesOut,
    eModes: eModes.map((e) => ({
      id: e.id,
      label: e.label,
      ltvBps: e.ltvBps,
      ltBps: e.ltBps,
      bonusBps: extraBonus(e.bonusRaw),
      collateralBitmap: e.collateralBitmap.toString(),
      borrowableBitmap: e.borrowableBitmap.toString(),
    })),
    totals: {
      positions: positions.length,
      collateralUsd: round2(totColl),
      debtUsd: round2(totDebt),
      reserveSuppliedUsd,
      reserveDebtUsd,
      borrowersEver: borrowers.length,
      borrowersWithDebt: withDebt.length,
      debtWithoutCollateral: { positions: noCollateral, debtUsd: round2(noCollateralDebtUsd) },
      byAsset,
    },
    positions,
  };
  const outPath = path.join(DATA_DIR, "positions.json");
  writeFileSync(outPath, JSON.stringify(out, null, 1));

  // summary
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n================ SUMMARY ================");
  console.log(`block ${blockNumber} | runtime ${secs}s | RPC multicall requests ${rpcRequests}`);
  console.log(`borrowers ever: ${borrowers.length} | with debt: ${withDebt.length} | positions: ${positions.length} | debt w/o collateral: ${noCollateral} ($${round2(noCollateralDebtUsd)})`);
  console.log(`borrower totals: collateral $${round2(totColl).toLocaleString("en-US")} | debt $${round2(totDebt).toLocaleString("en-US")}`);
  console.log(`reserve totals:  supplied $${reserveSuppliedUsd.toLocaleString("en-US")} | debt $${reserveDebtUsd.toLocaleString("en-US")}`);
  console.log(`dominant collateral priced with eMode params: ${dominantInEMode}/${positions.length}`);
  console.log(`HF |model - onchain|: median ${median(hfDiffModel).toFixed(6)}, p90 ${quantile(hfDiffModel, 0.9).toFixed(4)}, max ${Math.max(...hfDiffModel).toFixed(4)}`);
  console.log(`HF |exact-rule - onchain| (data sanity): median ${median(hfDiffExact).toExponential(2)}, max ${Math.max(...hfDiffExact).toExponential(2)}`);
  console.log(`collateral USD rel diff vs on-chain totalCollateralBase: median ${median(collDiff).toExponential(2)}, max ${Math.max(...collDiff).toExponential(2)}`);
  console.log("by dominant collateral:");
  for (const [id, v] of Object.entries(byAsset).sort((a, b) => b[1].debtUsd - a[1].debtUsd)) {
    console.log(
      `  ${id.padStart(2)} ${reserves[+id].symbol.padEnd(18)} n=${String(v.positions).padStart(4)}  coll $${v.collateralUsd.toLocaleString("en-US").padStart(16)}  debt $${v.debtUsd.toLocaleString("en-US").padStart(16)}  LT used ${v.ltBpsUsed.join("/")}`,
    );
  }
  console.log(`wrote ${outPath}`);
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

main().catch((e) => {
  console.error("FAILED:", redact((e as Error).message.split("\n").slice(0, 3).join(" | ")));
  process.exit(1);
});
