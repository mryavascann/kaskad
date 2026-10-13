import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { BORROW_EVENT_SIG } from "./abis.js";

export const BORROW_TOPIC = keccak256(toBytes(BORROW_EVENT_SIG));
export type BorrowerCursor = {
  version: 1; chainId: 143; pool: Address; seedBlock: number; scannedThrough: number;
  /** Active at the seed block OR observed in Borrow events since then; not an all-time count. */
  borrowers: Address[];
};
export type RpcLog = { address: string; blockNumber: Hex | null; topics: Hex[]; removed?: boolean };
export interface BorrowerRpc {
  getChainId(): Promise<number>;
  getBlock(args: { blockTag: "finalized" }): Promise<{ number: bigint | null }>;
  getLogs(args: { address: Address; fromBlock: bigint; toBlock: bigint; topics: Hex[] }): Promise<RpcLog[]>;
}
const validBlock = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** The shipped snapshot contains every then-active debt position; no all-time borrower claim. */
export function seedBorrowers(snapshot: unknown, pool: Address): BorrowerCursor {
  if (!record(snapshot) || snapshot.chainId !== 143 || snapshot.source !== "aave-v3-monad-mainnet" || !validBlock(snapshot.block) || !Array.isArray(snapshot.positions) || !record(snapshot.totals)) throw new Error("Invalid Monad borrower seed");
  const totals = snapshot.totals;
  if (!record(totals.debtWithoutCollateral) || totals.debtWithoutCollateral.positions !== 0 || totals.borrowersWithDebt !== snapshot.positions.length || totals.positions !== snapshot.positions.length || !snapshot.positions.length) throw new Error("Borrower seed does not cover all active debt positions");
  if (typeof totals.debtUsd !== "number" || !Number.isFinite(totals.debtUsd) || typeof totals.reserveDebtUsd !== "number" || !Number.isFinite(totals.reserveDebtUsd) || Math.abs(totals.debtUsd - totals.reserveDebtUsd) > 1) throw new Error("Borrower seed debt does not reconcile with reserve debt");
  const borrowers = snapshot.positions.map((p) => {
    if (!record(p) || typeof p.user !== "string") throw new Error("Invalid seed borrower");
    return getAddress(p.user);
  });
  if (new Set(borrowers).size !== borrowers.length) throw new Error("Duplicate seed borrower");
  return { version: 1, chainId: 143, pool: getAddress(pool), seedBlock: snapshot.block, scannedThrough: snapshot.block, borrowers };
}

export function parseCursor(value: unknown, pool: Address): BorrowerCursor {
  if (!record(value) || value.version !== 1 || value.chainId !== 143 || typeof value.pool !== "string" || getAddress(value.pool) !== getAddress(pool) || !validBlock(value.seedBlock) || !validBlock(value.scannedThrough) || value.scannedThrough < value.seedBlock || !Array.isArray(value.borrowers) || !value.borrowers.length) throw new Error("Invalid RPC borrower checkpoint");
  const borrowers = value.borrowers.map((a) => {
    if (typeof a !== "string") throw new Error("Invalid checkpoint address");
    return getAddress(a);
  });
  if (new Set(borrowers).size !== borrowers.length) throw new Error("Duplicate checkpoint address");
  return { version: 1, chainId: 143, pool: getAddress(pool), seedBlock: value.seedBlock, scannedThrough: value.scannedThrough, borrowers };
}

/** Finalized logs only, bounded sequential ranges, checkpoint only after the entire page validates. */
export async function scanBorrowers(rpc: BorrowerRpc, cursor: BorrowerCursor, options: {
  span?: number; maxPages?: number;
  save: (cursor: BorrowerCursor) => Promise<void>;
  pause?: () => Promise<void>;
  progress?: (info: { scannedThrough: number; target: number; pages: number; borrowers: number }) => void;
}) {
  let span = options.span ?? 1_000;
  const maxPages = options.maxPages ?? 200;
  if (!Number.isSafeInteger(span) || span < 1 || span > 1_000 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20_000) throw new Error("Invalid RPC scan limits");
  cursor = parseCursor(cursor, cursor.pool);
  if (await rpc.getChainId() !== 143) throw new Error("RPC must be Monad mainnet (chain 143)");
  const head = await rpc.getBlock({ blockTag: "finalized" });
  const target = Number(head.number);
  if (head.number === null || !validBlock(target) || target < cursor.scannedThrough) throw new Error("RPC is behind the checkpoint or has no finalized head");
  let pages = 0;
  let scannedThrough = cursor.scannedThrough;
  const borrowers = new Set(cursor.borrowers);
  while (scannedThrough < target && pages < maxPages) {
    const from = scannedThrough + 1;
    const to = Math.min(target, from + span - 1);
    let logs: RpcLog[];
    try {
      logs = await rpc.getLogs({ address: cursor.pool, fromBlock: BigInt(from), toBlock: BigInt(to), topics: [BORROW_TOPIC] });
    } catch (error) {
      // Smaller ranges help providers with 100-block caps; never silently skip a failing range.
      const message = String((error as Error)?.message ?? "");
      if (span > 1 && /block range|too many (results|logs)|response size|query returned more/i.test(message)) {
        span = Math.max(1, Math.floor(span / 2));
        continue;
      }
      throw new Error(`RPC Borrow scan failed at blocks ${from}..${to}; checkpoint retained. Check RPC availability and rerun.`);
    }
    if (!Array.isArray(logs) || logs.length >= 10_000) throw new Error("RPC log page may be truncated; checkpoint retained");
    const newBorrowers: Address[] = [];
    for (const log of logs) {
      const block = Number(log.blockNumber);
      if (log.removed || log.blockNumber === null || !validBlock(block) || block < from || block > to || typeof log.address !== "string" || getAddress(log.address) !== cursor.pool || !Array.isArray(log.topics) || log.topics.length !== 4 || log.topics[0].toLowerCase() !== BORROW_TOPIC || !/^0x0{24}[a-fA-F0-9]{40}$/.test(log.topics[2])) throw new Error("Invalid Borrow log; checkpoint retained");
      newBorrowers.push(getAddress(`0x${log.topics[2].slice(-40)}`));
    }
    for (const a of newBorrowers) borrowers.add(a);
    const next = { ...cursor, scannedThrough: to, borrowers: [...borrowers].sort() };
    await options.save(next);
    scannedThrough = to;
    pages++;
    options.progress?.({ scannedThrough, target, pages, borrowers: borrowers.size });
    if (scannedThrough < target && pages < maxPages) await options.pause?.();
  }
  return { cursor: { ...cursor, scannedThrough, borrowers: [...borrowers].sort() }, target, pages, complete: scannedThrough === target, transport: "eth_getLogs" as const };
}
