/**
 * B7 replay, step 2: every book position's real state at the Chainlink low (block 23549973, 21:20:59
 * UTC): health factor, collateral and debt, straight from Pool.getUserAccountData at that block.
 *
 * It explains the replay's misses honestly: a position the model liquidates but Aave did not either
 * was defended before the low (HF >= 1 there: debt repaid or collateral added) or sat below 1 without
 * a liquidator; a position Aave liquidated that the model did not lost value elsewhere (its other
 * collateral fell too: the model holds it at its USD value).
 *
 * Writes data/oct10-trough.json. READ-ONLY (eth_call at a past block on public archive RPCs).
 * Usage: npx tsx src/replay/oct10-trough.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";
import { DATA_DIR } from "../lib/env.js";
import { sleep } from "../lib/hypersync.js";
import { ARCHIVE_RPCS, POOL } from "./oct10.js";

const client = createPublicClient({ chain: mainnet, transport: fallback(ARCHIVE_RPCS.map((u) => http(u, { retryCount: 4, retryDelay: 1000, timeout: 60_000 }))) });
const poolAbi = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);
const CHUNK = 100;

async function main() {
  const book = JSON.parse(readFileSync(path.join(DATA_DIR, "oct10-weth.json"), "utf8")) as { positions: { user: Address }[] };
  const { low } = JSON.parse(readFileSync(path.join(DATA_DIR, "oct10-ethusd.json"), "utf8")) as { low: { block: number; time: string } };
  const users = book.positions.map((p) => p.user);
  const out: Record<string, { hf: number | null; collateralUsd: number; debtUsd: number }> = {};
  for (let i = 0; i < users.length; i += CHUNK) {
    const chunk = users.slice(i, i + CHUNK);
    const res = await client.multicall({
      contracts: chunk.map((u) => ({ address: POOL, abi: poolAbi, functionName: "getUserAccountData", args: [u] }) as const),
      allowFailure: false,
      blockNumber: BigInt(low.block),
    });
    chunk.forEach((u, j) => {
      const [coll, debt, , , , hf] = res[j];
      out[u] = { hf: debt === 0n ? null : Number(hf / 10n ** 12n) / 1e6, collateralUsd: Number(coll) / 1e8, debtUsd: Number(debt) / 1e8 };
    });
    if ((i / CHUNK) % 10 === 0) console.log(`  ${Math.min(i + CHUNK, users.length)}/${users.length}`);
    await sleep(200);
  }
  const hfs = Object.values(out).map((x) => x.hf);
  console.log(`[trough] block ${low.block} (${low.time}): ${users.length} users, HF<1 ${hfs.filter((h) => h !== null && h < 1).length}, debt repaid to 0 ${hfs.filter((h) => h === null).length}`);
  writeFileSync(path.join(DATA_DIR, "oct10-trough.json"), JSON.stringify({ block: low.block, time: low.time, users: out }, null, 1));
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
