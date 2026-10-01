/**
 * The console's first result, read on the server: the default preset's free preview (`eth_blockNumber`
 * + one `preview` pinned to that block) and, for a real book, its per-position classification (the book
 * read, about 2 requests). Plain props for the client: the first HTML already carries the real metrics,
 * narrative, tiles and timeline; the client takes over from there (`usePreview` gets it as initial
 * data and does not refetch it on mount).
 *
 * Same policy as the landing's finding (views/landing/data.ts): memoized per process on top of the
 * page's `revalidate`; a failed read or one at an older block never replaces an earlier good one
 * (within `KEEP_MS`). When there is nothing good to show, the page renders the normal client loading
 * state: never an invented number.
 */
import { canClassify, classifyPositions, readBook, type Classification } from "@/lib/chain/book";
import { previewScenario } from "@/lib/chain/engine";
import { defaultReader, type ChainReader } from "@/lib/chain/reader";
import { buildScenario, DEFAULT_PRESET_ID, presetById } from "@/lib/chain/scenario";
import type { Result, Scenario } from "@/lib/chain/types";
import type { PositionsInput } from "@/viz/position-tiles";
import type { VizPosition } from "@/viz/positions";

/** How long a successful read is reused in this process. */
export const INITIAL_TTL_MS = 10 * 60_000;
/** A failed read is retried sooner. */
export const INITIAL_RETRY_MS = 30_000;
/** An earlier good read may stand in for a failed or older one for at most this long. */
export const INITIAL_KEEP_MS = 60 * 60_000;

export type InitialPreview = {
  scenario: Scenario;
  result: Result;
  /** Wall time of the server's `preview` eth_call, ms (what the badge shows for a browser preview). */
  ms: number;
  /** Monad testnet block the preview ran at. */
  blockNumber: number;
  /** Local time the read finished (ms since epoch). */
  readAt: number;
  /**
   * Per-position classification of this run, reduced to what the tiles and their table show; null
   * when the book could not be read.
   */
  classification: PositionsInput | null;
};

/** The scenario the console opens with (preset `DEFAULT_PRESET_ID`). */
export function defaultScenario(): Scenario {
  return buildScenario(presetById(DEFAULT_PRESET_ID).settings);
}

/** One read: block, preview at that block, then the book (its failure only drops the tiles). */
export async function readInitialPreview(opts: { reader?: ChainReader; now?: () => number } = {}): Promise<InitialPreview> {
  const reader = opts.reader ?? defaultReader();
  const now = opts.now ?? Date.now;
  const scenario = defaultScenario();
  const block = await reader.getBlockNumber({ cacheTime: 0 });
  const t0 = performance.now();
  const result = await previewScenario(scenario, { reader, blockNumber: block });
  const ms = performance.now() - t0;
  let classification: PositionsInput | null = null;
  if (canClassify(scenario)) {
    try {
      const book = await readBook(scenario.assetId, { maxPositions: scenario.maxPositions, reader });
      classification = tilesInput(classifyPositions(book, result, scenario));
    } catch {}
  }
  return { scenario, result, ms, blockNumber: Number(block), readAt: now(), classification };
}

/** The fields the tiles and their table read (`VizPosition`): a smaller page payload. */
export function tilesInput(c: Classification): PositionsInput {
  if (!c.consistent) return c;
  const positions: VizPosition[] = c.positions.map((p) => ({
    index: p.index,
    outcome: p.outcome,
    debtUsd: p.debtUsd,
    healthFactor: p.healthFactor,
    liquidationPrice: p.liquidationPrice,
    thresholdDrop: p.thresholdDrop,
    firstLiquidationStep: p.firstLiquidationStep,
    finalHealthFactor: p.finalHealthFactor,
  }));
  return { consistent: true, positions };
}

/**
 * The newer read unless it is worse than an earlier one still within `INITIAL_KEEP_MS`: a failed read
 * (null), one at an older block (a lagging RPC node) or one that lost its tiles keeps the earlier one.
 */
export function mergeInitial(prev: InitialPreview | null, next: InitialPreview | null, now = Date.now()): InitialPreview | null {
  if (!prev || now - prev.readAt > INITIAL_KEEP_MS) return next;
  if (!next) return prev;
  if (next.blockNumber < prev.blockNumber) return prev;
  if (prev.classification !== null && next.classification === null) return prev;
  return next;
}

let cache: { at: number; ttl: number; data: Promise<InitialPreview | null> } | null = null;
let lastGood: InitialPreview | null = null;

/** The default preview, memoized per process (`INITIAL_TTL_MS`, `INITIAL_RETRY_MS` after a failure). */
export function loadInitialPreview(read: () => Promise<InitialPreview> = readInitialPreview): Promise<InitialPreview | null> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;
  const entry = {
    at: now,
    ttl: INITIAL_TTL_MS,
    data: read()
      .catch(() => null)
      .then((fresh) => {
        const merged = mergeInitial(lastGood, fresh);
        if (merged) lastGood = merged;
        if (!fresh || fresh.classification === null) entry.ttl = INITIAL_RETRY_MS;
        return merged;
      }),
  };
  cache = entry;
  return entry.data;
}

/** Tests: forget the per-process cache. */
export function resetInitialCache(): void {
  cache = null;
  lastGood = null;
}

/**
 * The page's guard for background regeneration (ISR): with no preview to show, throw, so Next.js keeps
 * serving the last page it generated and retries on a later request. Never throws while building (the
 * first page must exist; it renders the client loading state) or outside production.
 */
export function keepLastPageOnMissingPreview(
  d: InitialPreview | null,
  env: { phase?: string; nodeEnv?: string } = { phase: process.env.NEXT_PHASE, nodeEnv: process.env.NODE_ENV },
): InitialPreview | null {
  const regenerating = env.nodeEnv === "production" && env.phase !== "phase-production-build";
  if (regenerating && d === null) throw new Error("Console: default preview unreadable; keeping the last generated page");
  return d;
}
