import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BORROW_TOPIC, parseCursor, scanBorrowers, seedBorrowers, type BorrowerCursor, type BorrowerRpc, type RpcLog } from "./rpc-borrowers.js";
import { loadBorrowerCursor, saveBorrowerCursor } from "./rpc-borrowers-file.js";
const pool = "0x0000000000000000000000000000000000000001";
const a = "0x0000000000000000000000000000000000000002";
const b = "0x0000000000000000000000000000000000000003";
const seed = { chainId: 143, source: "aave-v3-monad-mainnet", block: 100, positions: [{ user: a }], totals: { positions: 1, borrowersWithDebt: 1, debtWithoutCollateral: { positions: 0 }, debtUsd: 10, reserveDebtUsd: 10 } };
const initial = () => seedBorrowers(seed, pool);
const log = (block = 101): RpcLog => ({ address: pool, blockNumber: `0x${block.toString(16)}`, topics: [BORROW_TOPIC, `0x${"0".repeat(64)}`, `0x${b.slice(2).padStart(64, "0")}`, `0x${"0".repeat(64)}`] });
const rpc = (head = 103, getLogs: BorrowerRpc["getLogs"] = async () => []): BorrowerRpc => ({ getChainId: async () => 143, getBlock: async () => ({ number: BigInt(head) }), getLogs });

test("fixed finalized head, inclusive ranges, borrower onBehalfOf and durable cursor", async () => {
  const ranges: bigint[][] = [];
  const saves: BorrowerCursor[] = [];
  const out = await scanBorrowers(rpc(105, async (q) => {
    ranges.push([q.fromBlock, q.toBlock]);
    assert.deepEqual(q.topics, [BORROW_TOPIC]);
    return q.fromBlock === 101n ? [log(), log()] : [];
  }), initial(), { span: 2, save: async (v) => { saves.push(v); } });
  assert.deepEqual(ranges, [[101n, 102n], [103n, 104n], [105n, 105n]]);
  assert.deepEqual(out.cursor.borrowers, [a, b]);
  assert.equal(out.complete, true);
  assert.equal(saves.at(-1)?.scannedThrough, 105);
});
test("bounded catch-up resumes without gaps or replacing the original cursor", async () => {
  const cursor = initial();
  const partial = await scanBorrowers(rpc(110), cursor, { span: 2, maxPages: 2, save: async () => {} });
  assert.equal(partial.complete, false);
  assert.equal(partial.cursor.scannedThrough, 104);
  assert.equal(cursor.scannedThrough, 100);
  const ranges: bigint[] = [];
  const next = await scanBorrowers(rpc(110, async (q) => { ranges.push(q.fromBlock); return []; }), partial.cursor, { span: 2, save: async () => {} });
  assert.deepEqual(ranges, [105n, 107n, 109n]);
  assert.equal(next.complete, true);
});
test("adapts provider block-range caps, without skipping the failing range", async () => {
  const ranges: bigint[][] = [];
  const out = await scanBorrowers(rpc(104, async (q) => {
    ranges.push([q.fromBlock, q.toBlock]);
    if (q.toBlock - q.fromBlock > 1n) throw new Error("block range too large");
    return [];
  }), initial(), { span: 4, save: async () => {} });
  assert.deepEqual(ranges, [[101n, 104n], [101n, 102n], [103n, 104n]]);
  assert.equal(out.complete, true);
});
test("network failure never advances the checkpoint and never leaks the RPC key", async () => {
  let writes = 0;
  await assert.rejects(scanBorrowers(rpc(103, async () => { throw new Error("https://private/key-secret"); }), initial(), { save: async () => { writes++; } }), (e: Error) => !e.message.includes("key-secret") && e.message.includes("checkpoint retained"));
  assert.equal(writes, 0);
});
for (const [index, invalid] of [ { ...log(), removed: true }, { ...log(), blockNumber: null }, log(99), { ...log(), address: b }, { ...log(), topics: [] }, { ...log(), topics: [BORROW_TOPIC, "0x00", "0x00", "0x00"] } ].entries()) {
  test(`invalid/removed log rejected before case ${index}`, async () => {
    let writes = 0;
    await assert.rejects(scanBorrowers(rpc(103, async () => [invalid as RpcLog]), initial(), { save: async () => { writes++; } }));
    assert.equal(writes, 0);
  });
}
test("rejects a potentially truncated log page", async () => {
  await assert.rejects(scanBorrowers(rpc(103, async () => Array(10_000).fill(log())), initial(), { save: async () => { assert.fail("must not save"); } }), /truncated/);
});
test("rejects incorrect chains, regressed heads and absent finalized head", async () => {
  for (const source of [{ ...rpc(), getChainId: async () => 1 }, rpc(99), { ...rpc(), getBlock: async () => ({ number: null }) }]) await assert.rejects(scanBorrowers(source, initial(), { save: async () => {} }));
});
test("rejects incomplete or inconsistent snapshot seeds", () => {
  for (const value of [{}, { ...seed, chainId: 1 }, { ...seed, block: -1 }, { ...seed, totals: { ...seed.totals, borrowersWithDebt: 2 } }, { ...seed, totals: { ...seed.totals, reserveDebtUsd: 100 } }, { ...seed, totals: { ...seed.totals, debtWithoutCollateral: { positions: 1 } } }]) assert.throws(() => seedBorrowers(value, pool));
});
test("validates saved checkpoints and safe scan limits", async () => {
  assert.throws(() => parseCursor({ ...initial(), pool: b }, pool));
  assert.throws(() => parseCursor({ ...initial(), scannedThrough: 0 }, pool));
  assert.throws(() => parseCursor({ ...initial(), borrowers: [a, a] }, pool));
  for (const maxPages of [0, NaN, 2.5, 20_001]) await assert.rejects(scanBorrowers(rpc(), initial(), { maxPages, save: async () => {} }));
});
test("loads the checked-in complete snapshot and saves checkpoints atomically", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kaskad-rpc-test-"));
  try {
    const snapshot = new URL("../../data/positions.json", import.meta.url);
    const value = seedBorrowers(JSON.parse(readFileSync(snapshot, "utf8")), pool);
    assert.equal(value.borrowers.length, 255);
    const file = path.join(dir, "checkpoint.json");
    saveBorrowerCursor(file, value);
    assert.deepEqual(loadBorrowerCursor(file, "/does-not-exist", pool), value);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
