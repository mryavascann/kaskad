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
  try {
    const c = await fetchFindingPositions(finding);
    if (c.consistent) positions = landingPositions(finding, c);
  } catch {}
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

let cache: { at: number; ttl: number; data: Promise<LandingData> } | null = null;

/** The landing's chain data, memoized per process (`LANDING_TTL_MS`, `LANDING_RETRY_MS` after a failure). */
export function loadLanding(): Promise<LandingData> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.data;
  const entry = { at: now, ttl: LANDING_TTL_MS, data: build() };
  cache = entry;
  void entry.data.then((d) => {
    if (!d.finding || !d.scale || !d.markets) entry.ttl = LANDING_RETRY_MS;
  });
  return entry.data;
}

/** Real book size for the neutral loading row (deployment.json). */
export function placeholderCount(assetId: number): number {
  return DEPLOYMENT.assets[String(assetId)]?.realPositions ?? 0;
}
