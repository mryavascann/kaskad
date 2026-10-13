import { getAddress, numberToHex } from "viem";
import type { BorrowerLabels, NansenLabel } from "@/lib/chain/exposure";
import { realToPacked, type RealPosition } from "@/lib/kaskad/calibrate";
import { packPosition } from "@/lib/kaskad/pack";
import { protection, type Protection } from "@/lib/server/protection";
import { isRecord } from "@/lib/server/request";
import { labelCache, parseLabels, type LabelCache } from "./cache";
import data from "./borrowers.json";

const NANSEN_URL = "https://api.nansen.ai/api/v1/profiler/address/labels";
export const TOP_BORROWERS = 60;
export const NANSEN_MINUTE_CAP = 60;
export const NANSEN_DAY_CAP = 600;
const CONCURRENCY = 4;
type Books = Record<string, { chain: "monad" | "ethereum"; positions: (RealPosition & { user: string })[] }>;
const BOOKS = (data as { books: Books }).books;
const SOURCE_BLOCK = data.source.monadBlock;
export const hasBorrowerBook = (assetId: string) => Object.hasOwn(BOOKS, assetId);
export class NansenError extends Error {
  constructor(public code: "invalid-key" | "quota-exhausted" | "rate-limited" | "failed", public status = 502) { super(code); }
}

async function lookup(address: string, chain: string, apiKey: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<NansenLabel[]> {
  let res: Response;
  try {
    res = await fetchImpl(NANSEN_URL, {
      method: "POST", headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ address, chain, pagination: { page: 1, per_page: 100 } }),
      cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    });
  } catch { throw new NansenError("failed"); }
  if (res.status === 429) throw new NansenError("rate-limited", 429);
  if (res.status === 401) throw new NansenError("invalid-key");
  if (res.status === 402) throw new NansenError("quota-exhausted");
  if (res.status === 403) {
    // Nansen also reports insufficient credits as 403, even for a valid key.
    const body: unknown = await res.json().catch(() => null);
    if (isRecord(body) && (body.code === "insufficient_credits" ||
      (typeof body.error === "string" && body.error.trim().toLowerCase() === "insufficient credits"))) {
      throw new NansenError("quota-exhausted");
    }
    throw new NansenError("invalid-key");
  }
  if (!res.ok) throw new NansenError("failed");
  const body: unknown = await res.json().catch(() => null);
  const labels = isRecord(body) ? parseLabels(body.data) : null;
  if (!labels) throw new NansenError("failed");
  return labels;
}

type Dependencies = { fetchImpl?: typeof fetch; cache?: LabelCache; guard?: Protection };
/** Fixed snapshot borrowers only: visitors cannot use the key to label arbitrary wallets. */
export async function borrowerLabels(assetId: string, apiKey: string, deps: Dependencies = {}): Promise<BorrowerLabels | null> {
  if (!hasBorrowerBook(assetId)) return null;
  const book = BOOKS[assetId];
  const cache = deps.cache ?? labelCache();
  const guard = deps.guard ?? protection();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(25_000);
  const packed = book.positions.map((p) => ({ ...p, raw: numberToHex(packPosition(realToPacked(p))) }));
  const counts = new Map<string, number>();
  for (const p of packed) counts.set(p.raw, (counts.get(p.raw) ?? 0) + 1);
  const top = [...packed].sort((a, b) => b.debtUsd - a.debtUsd).slice(0, TOP_BORROWERS);
  const labels: (NansenLabel[] | null)[] = new Array(top.length).fill(null);
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (next < top.length && !failure) {
      const i = next++;
      const p = top[i];
      // Identical packed positions cannot prove which borrower owns the slot; never guess.
      if (counts.get(p.raw) !== 1) continue;
      const key = `kaskad:nansen:v2:${book.chain}:${p.user.toLowerCase()}`;
      try {
        signal.throwIfAborted();
        const cached = await cache.get(key);
        if (cached !== null) { labels[i] = cached; continue; }
        // Shared address lock avoids duplicated paid lookups across books/instances.
        const lease = await guard.lock(`labels:lookup:${book.chain}:${p.user.toLowerCase()}`);
        try {
          const recheck = await cache.get(key);
          if (recheck !== null) { labels[i] = recheck; continue; }
          signal.throwIfAborted();
          await guard.consume([
            { key: "labels:upstream:minute", max: NANSEN_MINUTE_CAP, windowMs: 60_000 },
            { key: "labels:upstream:day", max: NANSEN_DAY_CAP, windowMs: 86_400_000 },
          ]);
          labels[i] = await lookup(p.user, book.chain, apiKey, fetchImpl, signal);
          await cache.set(key, labels[i]!);
        } finally { await lease.release(); }
      } catch (error) { failure ??= error; }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failure) throw failure;
  return {
    assetId: Number(assetId), chain: book.chain,
    sourceBlock: book.chain === "monad" ? SOURCE_BLOCK : null,
    total: book.positions.length,
    entries: top.flatMap((p, i) => counts.get(p.raw) === 1
      ? [{ raw: p.raw, address: getAddress(p.user), debtUsd: p.debtUsd, labels: labels[i] }]
      : []),
  };
}
