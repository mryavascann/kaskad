/**
 * Everything the landing shows, read from Monad testnet on the server (free eth_calls, no
 * transaction) and reduced to plain, serializable props. Each part fails on its own: a part that
 * could not be read is `null` and its section renders a same-size skeleton.
 *
 * Reads per build: finding (eth_blockNumber + 1 preview), its per-position replay (~2), the scale
 * proof transaction (3), both demo markets (6 calls, one batch). The result is memoized in-process for
 * `LANDING_TTL_MS` on top of the page's `revalidate`, so dev reloads don't hit the RPC every time.
 */
import type { Classification, PositionOutcome } from "@/lib/chain/book";
import { fetchFinding, fetchFindingPositions, type Finding } from "@/lib/chain/finding";
import { readMarkets } from "@/lib/chain/guard";
import { limitFacts } from "@/lib/chain/limits";
import { PROOF_TXS, readProof } from "@/lib/chain/proofs";
import { cascadeTimeline } from "@/lib/chain/timeline";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { heroFromClassification, type HeroData } from "@/three/data";

/** How long a successful read is reused in this process (the page itself revalidates every 600 s). */
export const LANDING_TTL_MS = 10 * 60_000;
/** A failed read is retried sooner. */
export const LANDING_RETRY_MS = 30_000;
/** A complete earlier read may stand in for a failed or partial one for at most this long. */
export const LANDING_KEEP_MS = 60 * 60_000;
/** Attempts at the per-position read (the public RPC drops a request now and then). */
export const POSITION_ATTEMPTS = 2;
const POSITION_RETRY_DELAY_MS = 1500;
/**
 * Waits before the extra whole-read attempts made while building. A build that fails to read the
 * chain would publish a page without the finding until the first regeneration (600 s later), and the
 * public RPC drops requests when many pages and OG images prerender at once. Runtime reads don't wait:
 * ISR keeps the last page instead (`keepLastPageOnPartialRead`).
 */
export const BUILD_RETRY_DELAYS_MS: readonly number[] = [3_000, 8_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `read` until `done` holds, waiting `delays[i]` before extra attempt i + 1; returns the last read. */
export async function readUntil<T>(read: () => Promise<T>, done: (v: T) => boolean, delays: readonly number[], wait = sleep): Promise<T> {
  let value = await read();
  for (const ms of delays) {
    if (done(value)) break;
    await wait(ms);
    value = await read();
  }
  return value;
}

const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

export type LandingWave = {
  /** 1-based wave number across the run. */
  n: number;
  /** Engine block (1..steps) and wave within it. */
  step: number;
  round: number;
  liquidations: number;
  /** Oracle price the wave ran at (USD). */
  price: number;
  liquidatedUsd: number;
};

export type LandingFinding = {
  /** Monad testnet block the preview ran at. */
  blockNumber: number | null;
  assetId: number;
  symbol: string;
  /** Final depeg as a fraction (0.03 = −3 %). */
  shock: number;
  oracle: "external" | "pool";
  steps: number;
  stuckDebtUsd: number;
  clearedUsd: number;
  gapRatio: number | null;
  badDebtUsd: number;
  totalDebtUsd: number;
  positionsUsed: number;
  liquidations: number;
  startPrice: number;
  finalPrice: number;
  poolDepthUsd: number;
  depthIsAssumption: boolean;
  depthNote: string;
  /** Oracle price at the start of each block 0..steps (last = final price). */
  prices: number[];
  waves: LandingWave[];
};

export type LandingPositions = {
  total: number;
  belowThreshold: number;
  counts: Record<PositionOutcome, number>;
  /** Dominoes and the block timeline for the hero stage. */
  hero: HeroData;
  /**
   * Per position, the first block whose oracle price sits under its liquidation price (null: never
   * in this run). The scroll scene counts positions under the threshold with it.
   */
  crossBlocks: (number | null)[];
  /** The largest position of the book by debt, for the wallet teaser's dial. */
  largest: { debtUsd: number; healthFactor: number; finalHealthFactor: number | null; thresholdDrop: number | null } | null;
};

export type LandingScale = {
  /** Proof transaction (the 10,000-position synthetic book, one tx). */
  hash: string;
  blockNumber: number;
  positions: number;
  facts: ReturnType<typeof limitFacts>;
};

export type LandingMarkets = {
  a: { paused: boolean; maxLtvBps: number };
  b: { paused: boolean; maxLtvBps: number };
};

export type LandingData = {
  finding: LandingFinding | null;
  positions: LandingPositions | null;
  scale: LandingScale | null;
  markets: LandingMarkets | null;
  /** Local time the reads finished (ms since epoch). */
  readAt: number;
};

export function landingFinding(f: Finding): LandingFinding {
  const timeline = cascadeTimeline(f.result, f.scenario);
  return {
    blockNumber: f.blockNumber === null ? null : Number(f.blockNumber),
    assetId: f.assetId,
    symbol: f.symbol,
    shock: f.scenario.shockBps / 10_000,
    oracle: f.oracle,
    steps: f.scenario.steps,
    stuckDebtUsd: f.stuckDebtUsd,
    clearedUsd: f.clearedUsd,
    gapRatio: f.gapRatio,
    badDebtUsd: f.badDebtUsd,
    totalDebtUsd: f.totalDebtUsd,
    positionsUsed: f.positionsUsed,
    liquidations: f.liquidations,
    startPrice: f.startPrice,
    finalPrice: f.finalPrice,
    poolDepthUsd: f.poolDepthUsd,
    depthIsAssumption: f.depthIsAssumption,
    depthNote: f.depthNote,
    prices: timeline.points.map((p) => p.price),
    waves: f.result.log.map((w, i) => ({
      n: i + 1,
      step: w.step,
      round: w.round,
      liquidations: w.liquidations,
      price: wadToNum(w.priceWad),
      liquidatedUsd: wadToNum(w.liquidatedDebt),
    })),
  };
}

/** First block (1..steps) whose price is under `liquidationPrice`; 0 when already under at the start. */
export function crossBlock(prices: readonly number[], liquidationPrice: number): number | null {
  if (!(liquidationPrice > 0)) return null;
  for (let k = 0; k < prices.length; k++) if (prices[k] < liquidationPrice) return k;
  return null;
}

/** Per-position view of a consistent classification of the finding's preview (pure). */
export function landingPositions(finding: Finding, c: Extract<Classification, { consistent: true }>): LandingPositions {
  const prices = cascadeTimeline(finding.result, finding.scenario).points.map((p) => p.price);
  const largest = c.positions.reduce<(typeof c.positions)[number] | null>((m, p) => (!m || p.debtUsd > m.debtUsd ? p : m), null);
  return {
    total: c.positions.length,
    belowThreshold: c.belowThreshold,
    counts: c.counts,
    hero: heroFromClassification(c.positions, finding.scenario, { result: finding.result }),
    crossBlocks: c.positions.map((p) => crossBlock(prices, p.liquidationPrice)),
    largest: largest && {
      debtUsd: largest.debtUsd,
      healthFactor: largest.healthFactor,
      finalHealthFactor: largest.finalHealthFactor,
      thresholdDrop: largest.thresholdDrop,
    },
  };
}

/** The 10,000-position proof run against both chains' per-transaction gas ceilings (pure). */
export function landingScale(run: { hash: string; blockNumber: number; positionsUsed: number; memoryBytes: bigint; gasUsed: bigint }): LandingScale {
  return { hash: run.hash, blockNumber: run.blockNumber, positions: run.positionsUsed, facts: limitFacts(run) };
}

async function readFinding() {
  const finding = await fetchFinding();
  let positions: LandingPositions | null = null;
  for (let attempt = 1; attempt <= POSITION_ATTEMPTS && !positions; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, POSITION_RETRY_DELAY_MS));
    try {
      const c = await fetchFindingPositions(finding);
      if (c.consistent) positions = landingPositions(finding, c);
    } catch {}
  }
  return { finding: landingFinding(finding), positions };
}

async function readScale(): Promise<LandingScale | null> {
  const entry = PROOF_TXS.find((p) => p.id === "scale");
  if (!entry) return null;
  const record = await readProof(entry);
  const sim = record.simulation;
  if (!sim || record.status !== "success") return null;
  return landingScale({
    hash: record.hash,
    blockNumber: Number(record.blockNumber),
    positionsUsed: Number(sim.positionsUsed),
    memoryBytes: sim.memoryBytes,
    gasUsed: sim.gasUsed,
  });
}

async function readMarketsView(): Promise<LandingMarkets> {
  const m = await readMarkets();
  return { a: { paused: m.a.paused, maxLtvBps: m.a.maxLtvBps }, b: { paused: m.b.paused, maxLtvBps: m.b.maxLtvBps } };
}

const settle = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

async function build(): Promise<LandingData> {
  // Sequential on purpose: a handful of requests, spaced, on the public RPC.
  const found = await settle(readFinding());
  const scale = await settle(readScale());
  const markets = await settle(readMarketsView());
  return { finding: found?.finding ?? null, positions: found?.positions ?? null, scale, markets, readAt: Date.now() };
}

/** True when every part was read (the hero has its finding and its per-position replay). */
export function isComplete(d: LandingData): boolean {
  return d.finding !== null && d.positions !== null && d.scale !== null && d.markets !== null;
}

/**
 * The newer read, except where it is worse than an earlier one still within `LANDING_KEEP_MS`:
 * a part that failed keeps the earlier value, and the finding + positions pair (they belong
 * together) keeps the earlier pair when the new one lost its positions or ran at an older block
 * (a lagging RPC node). Never mixes a finding with another read's positions.
 */
export function mergeLanding(prev: LandingData | null, next: LandingData, now = Date.now()): LandingData {
  if (!prev || now - prev.readAt > LANDING_KEEP_MS) return next;
  const pb = prev.finding?.blockNumber ?? null;
  const nb = next.finding?.blockNumber ?? null;
  const olderBlock = pb !== null && nb !== null && nb < pb;
  const lostPositions = prev.finding !== null && prev.positions !== null && next.positions === null;
  const keepPair = next.finding === null || olderBlock || lostPositions;
  return {
    finding: keepPair ? prev.finding : next.finding,
    positions: keepPair ? prev.positions : next.positions,
    scale: next.scale ?? prev.scale,
    markets: next.markets ?? prev.markets,
    readAt: keepPair ? prev.readAt : next.readAt,
  };
}

let cache: { at: number; ttl: number; data: Promise<LandingData> } | null = null;
let lastGood: LandingData | null = null;

/**
 * The landing's chain data, memoized per process (`LANDING_TTL_MS`, `LANDING_RETRY_MS` after a
 * failure). A failed or partial read never replaces a better earlier one (`mergeLanding`).
 */
export function loadLanding(): Promise<LandingData> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;
  const entry = {
    at: now,
    ttl: LANDING_TTL_MS,
    data: readUntil(build, isComplete, isBuildPhase() ? BUILD_RETRY_DELAYS_MS : []).then((fresh) => {
      const merged = mergeLanding(lastGood, fresh);
      if (isComplete(merged)) lastGood = merged;
      if (!isComplete(fresh)) entry.ttl = LANDING_RETRY_MS;
      return merged;
    }),
  };
  cache = entry;
  return entry.data;
}

/** Tests: forget the per-process cache. */
export function resetLandingCache(): void {
  cache = null;
  lastGood = null;
}

/**
 * The page's guard for background regeneration (ISR): when the hero's data (finding + per-position
 * replay) could not be read, throw, so Next.js keeps serving the last page it generated and retries
 * on a later request (documented ISR behavior). Never throws while building (the first page must
 * exist; it renders skeletons for what is missing) or outside production (`next dev`).
 */
export function keepLastPageOnPartialRead(d: LandingData, env: { phase?: string; nodeEnv?: string } = { phase: process.env.NEXT_PHASE, nodeEnv: process.env.NODE_ENV }): LandingData {
  const regenerating = env.nodeEnv === "production" && env.phase !== "phase-production-build";
  if (regenerating && (d.finding === null || d.positions === null)) {
    throw new Error("Landing: finding or per-position replay unreadable; keeping the last generated page");
  }
  return d;
}

/** Real book size for the neutral loading row (deployment.json). */
export function placeholderCount(assetId: number): number {
  return DEPLOYMENT.assets[String(assetId)]?.realPositions ?? 0;
}
