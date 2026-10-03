/**
 * B7 replay, step 1: what actually happened on Aave V3 Ethereum on 10-11 October 2025.
 *
 *  - Price path: every Chainlink ETH/USD update (AnswerUpdated on the aggregator behind the source
 *    AaveOracle uses for WETH at the book block) between FROM and TO.
 *  - Liquidations: every Pool LiquidationCall in [FROM, TO], each leg priced with AaveOracle at its
 *    own block (the price the protocol used), symbols and decimals from the tokens.
 *
 * Writes data/oct10-ethusd.json, data/oct10-liquidations.json and data/oct10-liquidated.json (the
 * users liquidated against WETH collateral, fed to fetch-eth-syrup.ts --extra so the replay book can
 * never miss them). READ-ONLY: eth_getLogs / eth_call on public archive RPCs.
 *
 * Usage: npx tsx src/replay/oct10-events.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, fallback, getAddress, http, parseAbi, parseAbiItem, type Address } from "viem";
import { mainnet } from "viem/chains";
import { DATA_DIR } from "../lib/env.js";
import { sleep } from "../lib/hypersync.js";
import { AAVE_ORACLE, ARCHIVE_RPCS, BOOK_BLOCK, FROM, POOL, TO, WETH } from "./oct10.js";

const client = createPublicClient({ chain: mainnet, transport: fallback(ARCHIVE_RPCS.map((u) => http(u, { retryCount: 4, retryDelay: 1000, timeout: 60_000 }))) });

const LIQUIDATION = parseAbiItem(
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
);
const ANSWER = parseAbiItem("event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)");
const oracleAbi = parseAbi(["function getSourceOfAsset(address) view returns (address)", "function getAssetPrice(address) view returns (uint256)"]);
const feedAbi = parseAbi(["function aggregator() view returns (address)", "function description() view returns (string)"]);
const erc20 = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

async function main() {
  // Price path ------------------------------------------------------------------------------------
  const source = await client.readContract({ address: AAVE_ORACLE, abi: oracleAbi, functionName: "getSourceOfAsset", args: [WETH], blockNumber: BigInt(BOOK_BLOCK) });
  const aggregator = await client.readContract({ address: source, abi: feedAbi, functionName: "aggregator", blockNumber: BigInt(BOOK_BLOCK) });
  const description = await client.readContract({ address: source, abi: feedAbi, functionName: "description", blockNumber: BigInt(BOOK_BLOCK) });
  const bookPrice = await client.readContract({ address: AAVE_ORACLE, abi: oracleAbi, functionName: "getAssetPrice", args: [WETH], blockNumber: BigInt(BOOK_BLOCK) });
  const answers = await client.getLogs({ address: aggregator, event: ANSWER, fromBlock: BigInt(FROM), toBlock: BigInt(TO) });
  const path_ = answers.map((l) => ({
    block: Number(l.blockNumber),
    time: new Date(Number(l.args.updatedAt) * 1000).toISOString(),
    priceUsd: Number(l.args.current) / 1e8,
  }));
  const low = path_.reduce((m, p) => (p.priceUsd < m.priceUsd ? p : m), path_[0]);
  const startUsd = Number(bookPrice) / 1e8;
  const drawdownBps = Math.round((1 - low.priceUsd / startUsd) * 10_000);
  console.log(`[price] ${description} via ${source} (aggregator ${aggregator}): book block ${BOOK_BLOCK} $${startUsd}, low $${low.priceUsd} at ${low.time} (block ${low.block}) = -${drawdownBps / 100}%, ${path_.length} updates`);
  writeFileSync(
    path.join(DATA_DIR, "oct10-ethusd.json"),
    JSON.stringify({ feed: { description, source, aggregator }, bookBlock: BOOK_BLOCK, bookPriceUsd: startUsd, low, drawdownBps, from: FROM, to: TO, updates: path_ }, null, 1),
  );

  // Liquidations ----------------------------------------------------------------------------------
  const logs = await client.getLogs({ address: POOL, event: LIQUIDATION, fromBlock: BigInt(FROM), toBlock: BigInt(TO) });
  console.log(`[liq] ${logs.length} LiquidationCall events in blocks ${FROM}..${TO}`);
  const assets = [...new Set(logs.flatMap((l) => [l.args.collateralAsset!, l.args.debtAsset!]))];
  const meta = new Map<string, { symbol: string; decimals: number }>();
  for (const a of assets) {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: a, abi: erc20, functionName: "symbol" }).catch(() => a.slice(0, 8)),
      client.readContract({ address: a, abi: erc20, functionName: "decimals" }),
    ]);
    meta.set(a.toLowerCase(), { symbol, decimals: Number(decimals) });
  }

  // AaveOracle prices at each liquidation block (one multicall per block).
  const byBlock = new Map<bigint, Set<Address>>();
  for (const l of logs) {
    const s = byBlock.get(l.blockNumber) ?? new Set<Address>();
    s.add(l.args.collateralAsset!);
    s.add(l.args.debtAsset!);
    byBlock.set(l.blockNumber, s);
  }
  const prices = new Map<string, bigint>(); // `${block}:${asset}` -> USD 1e8
  const times = new Map<bigint, number>();
  let n = 0;
  for (const [block, set] of byBlock) {
    const list = [...set];
    const res = await client.multicall({
      contracts: list.map((a) => ({ address: AAVE_ORACLE, abi: oracleAbi, functionName: "getAssetPrice", args: [a] }) as const),
      allowFailure: false,
      blockNumber: block,
    });
    list.forEach((a, i) => prices.set(`${block}:${a.toLowerCase()}`, res[i] as bigint));
    times.set(block, Number((await client.getBlock({ blockNumber: block })).timestamp));
    if (++n % 20 === 0) console.log(`  priced ${n}/${byBlock.size} blocks`);
    await sleep(150);
  }

  const usd = (raw: bigint, asset: string, block: bigint) => {
    const m = meta.get(asset.toLowerCase())!;
    return Number((raw * prices.get(`${block}:${asset.toLowerCase()}`)!) / 10n ** BigInt(m.decimals)) / 1e8;
  };
  const rows = logs.map((l) => {
    const a = l.args;
    return {
      block: Number(l.blockNumber),
      time: new Date(times.get(l.blockNumber)! * 1000).toISOString(),
      tx: l.transactionHash,
      logIndex: l.logIndex,
      user: getAddress(a.user!),
      collateral: meta.get(a.collateralAsset!.toLowerCase())!.symbol,
      collateralAsset: getAddress(a.collateralAsset!),
      debt: meta.get(a.debtAsset!.toLowerCase())!.symbol,
      debtAsset: getAddress(a.debtAsset!),
      debtToCover: a.debtToCover!.toString(),
      debtUsd: Math.round(usd(a.debtToCover!, a.debtAsset!, l.blockNumber) * 100) / 100,
      collateralSeized: a.liquidatedCollateralAmount!.toString(),
      collateralUsd: Math.round(usd(a.liquidatedCollateralAmount!, a.collateralAsset!, l.blockNumber) * 100) / 100,
      liquidator: getAddress(a.liquidator!),
    };
  });
  const sum = (xs: typeof rows) => Math.round(xs.reduce((s, r) => s + r.debtUsd, 0));
  const byCollateral = new Map<string, typeof rows>();
  for (const r of rows) byCollateral.set(r.collateral, [...(byCollateral.get(r.collateral) ?? []), r]);
  for (const [c, rs] of [...byCollateral].sort((a, b) => sum(b[1]) - sum(a[1]))) {
    console.log(`  ${c.padEnd(10)} ${String(rs.length).padStart(4)} liquidations, debt repaid $${sum(rs).toLocaleString("en-US")}, users ${new Set(rs.map((r) => r.user)).size}`);
  }
  console.log(`  total ${rows.length} liquidations, debt repaid $${sum(rows).toLocaleString("en-US")}`);
  writeFileSync(path.join(DATA_DIR, "oct10-liquidations.json"), JSON.stringify({ pool: POOL, oracle: AAVE_ORACLE, from: FROM, to: TO, liquidations: rows }, null, 1));
  const wethUsers = [...new Set(rows.filter((r) => r.collateralAsset.toLowerCase() === WETH.toLowerCase()).map((r) => r.user))];
  writeFileSync(path.join(DATA_DIR, "oct10-liquidated.json"), JSON.stringify(wethUsers, null, 1));
  console.log(`[liq] ${wethUsers.length} users liquidated against WETH -> data/oct10-liquidated.json`);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
