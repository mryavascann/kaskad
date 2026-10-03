// Exact off-chain mirror of the cascade engine (contracts/src/Kaskad.sol `_run`, with KaskadMC's
// `_load` / `_bookInfo` / `_recoveryBps`), for one purpose only: attributing the engine's aggregate
// Result to individual positions (the engine logs per-wave totals, not per position). It never
// stands in for the chain: book.ts classifyPositions() compares this mirror with an on-chain
// preview field by field and refuses to classify when anything differs.
// Pure bigint math, integer semantics identical to the contract (floor division, same order).

import type { RoundLog } from "./types";

const WAD = 10n ** 18n;
const BPS = 10_000n;
const SCALE_1E6 = 10n ** 12n; // Kaskad.sol:14
const CLOSE_FACTOR_HF_THRESHOLD = 95n * 10n ** 16n; // Kaskad.sol:15 (0.95e18, Aave v3.3)
const MIN_BASE_MAX_CLOSE_FACTOR = 2_000n * WAD; // Kaskad.sol:16 (USD, Aave v3.3)
const LP_MAX = (1n << 224n) - 1n; // Kaskad.sol:17
const IDX_MASK = 0xffffffffn; // Kaskad.sol:18
const MASK88 = (1n << 88n) - 1n; // Kaskad.sol:19
const MAX_STEPS = 100; // Kaskad.sol:21
const MAX_ROUNDS = 20; // Kaskad.sol:22

/** OpenZeppelin Math.mulDiv rounds down; bigint division truncates, identical for non-negatives. */
const mulDiv = (a: bigint, b: bigint, d: bigint): bigint => (a * b) / d;

/** What the engine reads for a book: `assets(asset)`, `bookStats(bookId)`, recovery and raw slots. */
export type ReplayBook = {
  priceWad: bigint;
  depthUsdWad: bigint;
  /** bookStats(bookId).debt1e6: total debt of the whole book (scales the pool at partial resolution). */
  bookDebt1e6: bigint;
  /** KaskadMC.recoveryBps(asset) for real books on KaskadMC; 0 on Kaskad (Kaskad.sol:224-226). */
  recoveryBps: number;
  /** Raw packed slots in book order (rawSlot(bookId, i)); at least maxPositions of them. */
  slots: readonly bigint[];
};

export type ReplayScenario = {
  shockBps: number;
  steps: number;
  maxRoundsPerStep: number;
  maxPositions: number;
  oracleFeedbackBps: number;
};

export type PositionEnd = "bad-debt" | "stuck" | "healthy";

export type PositionTrace = {
  index: number;
  /** Start state, WAD: collateral tokens, debt USD, other collateral USD (fixed price). */
  coll0: bigint;
  debt0: bigint;
  other: bigint;
  ltBps: number;
  bonusBps: number;
  /** Oracle price under which the position's HF drops below 1 at the start (`_lp`); 0 = never. */
  liqPrice0: bigint;
  /** Liquidations of this position (one wave can hit it once). */
  events: number;
  repaid: bigint;
  seized: bigint;
  /** Block of the first liquidation, null if never liquidated. */
  firstStep: number | null;
  /** End state, WAD. */
  coll: bigint;
  debt: bigint;
  /** `_badDebt` classification at the final price (Kaskad.sol:466-484). */
  end: PositionEnd;
  /** max(0, debt - collateral value) at the final price: this position's share of badDebt. */
  shortfall: bigint;
};

export type ReplayResult = {
  totalDebt: bigint;
  totalCollateral: bigint;
  totalLiquidated: bigint;
  totalSeized: bigint;
  badDebt: bigint;
  stuckDebt: bigint;
  startPrice: bigint;
  finalPrice: bigint;
  /**
   * Pool spot price at the end (KaskadMCv3.previewWithHidden): what selling the collateral pays now.
   * Equals `finalPrice` when the oracle follows the pool (feedback 100 %).
   */
  spotPrice: bigint;
  /** `_badDebt` with collateral valued at `spotPrice`, and the part of it the oracle does not show. */
  badDebtAtSpot: bigint;
  hiddenBadDebt: bigint;
  rounds: number;
  liquidations: number;
  positionsUsed: number;
  log: RoundLog[];
  positions: PositionTrace[];
};

/** Kaskad.sol:450-458. */
function lp(c: bigint, d: bigint, other: bigint, lt: bigint): bigint {
  const need = (d * BPS) / lt;
  if (need <= other || c === 0n) return 0n;
  const v = ((need - other) * WAD) / c;
  return v > LP_MAX ? LP_MAX : v;
}

/** Kaskad.sol:461-463: constant-product price impact, price scales with (x0 / x)^2. */
const impact = (base: bigint, x0: bigint, x: bigint): bigint => mulDiv(mulDiv(base, x0, x), x0, x);

/** Kaskad.sol:487-509: max-heap sift down on h[0..size). */
function siftDown(h: bigint[], i: number, size: number): void {
  const v = h[i];
  for (;;) {
    let l = 2 * i + 1;
    if (l >= size) break;
    let cv = h[l];
    const r = l + 1;
    if (r < size && h[r] > cv) {
      l = r;
      cv = h[r];
    }
    if (!(cv > v)) break;
    h[i] = cv;
    i = l;
  }
  h[i] = v;
}

/** Kaskad.sol:512-525: max-heap sift up. */
function siftUp(h: bigint[], i: number): void {
  const v = h[i];
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!(h[p] < v)) break;
    h[i] = h[p];
    i = p;
  }
  h[i] = v;
}

/** Kaskad.sol:200-210 `_validate`, as exceptions. */
function validate(book: ReplayBook, s: ReplayScenario): void {
  if (book.priceWad === 0n) throw new RangeError("InvalidAsset: no price for this book");
  if (s.shockBps > 10_000) throw new RangeError("InvalidShock");
  if (s.oracleFeedbackBps > 10_000) throw new RangeError("InvalidFeedback");
  if (s.steps === 0 || s.steps > MAX_STEPS) throw new RangeError("InvalidSteps");
  if (s.maxRoundsPerStep === 0 || s.maxRoundsPerStep > MAX_ROUNDS) throw new RangeError("InvalidRounds");
  if (s.maxPositions === 0 || s.maxPositions > book.slots.length) throw new RangeError("InvalidPositions");
}

export function replay(book: ReplayBook, s: ReplayScenario): ReplayResult {
  validate(book, s);
  const n = s.maxPositions;

  // _load (Kaskad.sol:306-353, KaskadMC.sol:220-245): decode, heap key = liquidation price << 32 | index
  const coll: bigint[] = new Array(n);
  const debt: bigint[] = new Array(n);
  const other: bigint[] = new Array(n);
  const lt: bigint[] = new Array(n);
  const bonus: bigint[] = new Array(n);
  const heap: bigint[] = new Array(n);
  const traces: PositionTrace[] = new Array(n);
  let totalDebt = 0n;
  let totalCollateral = 0n;
  for (let i = 0; i < n; i++) {
    const w = book.slots[i];
    coll[i] = (w & MASK88) * SCALE_1E6;
    debt[i] = ((w >> 88n) & MASK88) * SCALE_1E6;
    other[i] = ((w >> 176n) & 0xffffffffn) * WAD;
    lt[i] = (w >> 216n) & 0xffffn;
    bonus[i] = (w >> 232n) & 0xffffn;
    const key = lp(coll[i], debt[i], other[i], lt[i]);
    heap[i] = (key << 32n) | BigInt(i);
    totalDebt += debt[i];
    totalCollateral += coll[i];
    traces[i] = {
      index: i,
      coll0: coll[i],
      debt0: debt[i],
      other: other[i],
      ltBps: Number(lt[i]),
      bonusBps: Number(bonus[i]),
      liqPrice0: key,
      events: 0,
      repaid: 0n,
      seized: 0n,
      firstStep: null,
      coll: 0n,
      debt: 0n,
      end: "healthy",
      shortfall: 0n,
    };
  }
  for (let i = Math.floor(n / 2); i > 0; i--) siftDown(heap, i - 1, n);

  // _initPool (Kaskad.sol:230-236): depth scaled by the simulated share of the book's debt
  const depth = mulDiv(book.depthUsdWad, totalDebt, book.bookDebt1e6 * SCALE_1E6);
  let x0 = mulDiv(depth, WAD, 2n * book.priceWad);
  if (x0 === 0n) x0 = 1n;
  let x = x0;
  let base = 0n;
  let heapSize = n;

  // _linearPath (Kaskad.sol:239-244)
  const drop: bigint[] = [];
  for (let i = 0; i < s.steps; i++) drop.push((BigInt(s.shockBps) * BigInt(i + 1) * WAD) / (BPS * BigInt(s.steps)));

  /** Kaskad.sol:408-446 `_liquidate`. */
  const liquidate = (i: number, price: bigint): { repay: bigint; seize: bigint; deficit: bigint } => {
    let c = coll[i];
    let d = debt[i];
    const collVal = mulDiv(c, price, WAD);
    const hf = mulDiv((collVal + other[i]) * lt[i], WAD, d * BPS);
    const full = hf < CLOSE_FACTOR_HF_THRESHOLD || d < MIN_BASE_MAX_CLOSE_FACTOR || collVal < MIN_BASE_MAX_CLOSE_FACTOR;
    let repay = full ? d : d / 2n;
    let seize = mulDiv(repay * (BPS + bonus[i]), WAD, BPS * price);
    if (seize >= c) {
      seize = c;
      repay = mulDiv(collVal, BPS, BPS + bonus[i]);
      if (repay > d) repay = d;
    }
    const y = mulDiv(mulDiv(base, x0, x), x0, WAD);
    const xMax = mulDiv(y * (BPS + bonus[i]), WAD, BPS * price);
    const cap = xMax > x ? xMax - x : 0n;
    if (seize > cap) {
      seize = cap; // partial liquidation up to break-even, 0 = stuck this round
      repay = mulDiv(seize * BPS, price, (BPS + bonus[i]) * WAD);
      if (seize === 0n || repay === 0n) return { repay: 0n, seize: 0n, deficit: 0n };
    }
    x += seize;
    c -= seize;
    d -= repay;
    coll[i] = c;
    debt[i] = d;
    return { repay, seize, deficit: c === 0n && d > other[i] ? d - other[i] : 0n };
  };

  const pending: bigint[] = new Array(n);
  /** Kaskad.sol:358-402 `_liquidateRound`: every position above `price`, once per round. */
  const liquidateRound = (price: bigint, step: number) => {
    let size = heapSize;
    let np = 0;
    let liq = 0n;
    let seized = 0n;
    let cnt = 0;
    let def = 0n;
    while (size > 0) {
      const top = heap[0];
      if (top >> 32n <= price) break;
      size--;
      heap[0] = heap[size];
      siftDown(heap, 0, size);
      const i = Number(top & IDX_MASK);
      const r = liquidate(i, price);
      if (r.repay === 0n) {
        pending[np++] = top; // pool too thin to liquidate at a profit: this wave is over
        break;
      }
      liq += r.repay;
      seized += r.seize;
      cnt++;
      const t = traces[i];
      t.events++;
      t.repaid += r.repay;
      t.seized += r.seize;
      t.firstStep ??= step;
      const c = coll[i];
      if (c > 0n && debt[i] > 0n) pending[np++] = (lp(c, debt[i], other[i], lt[i]) << 32n) | BigInt(i);
      else def += r.deficit;
    }
    for (let k = 0; k < np; k++) {
      heap[size] = pending[k];
      siftUp(heap, size);
      size++;
    }
    heapSize = size;
    return { liq, seized, cnt, def };
  };

  // _cascade (Kaskad.sol:249-303)
  const p0 = book.priceWad;
  const feedback = BigInt(s.oracleFeedbackBps);
  const recovery = BigInt(book.recoveryBps);
  const log: RoundLog[] = [];
  let totalLiquidated = 0n;
  let totalSeized = 0n;
  let liquidations = 0;
  let deficit = 0n;
  let price = p0;
  for (let step = 1; step <= s.steps; step++) {
    if (recovery > 0n && x > x0) x = x0 + mulDiv(x - x0, BPS - recovery, BPS);
    base = mulDiv(p0, WAD - drop[step - 1], WAD);
    for (let round = 0; round < s.maxRoundsPerStep; round++) {
      const spot = impact(base, x0, x);
      price = base - mulDiv(base - spot, feedback, BPS);
      if (price === 0n) break;
      const w = liquidateRound(price, step);
      deficit += w.def;
      if (w.cnt === 0) break;
      totalLiquidated += w.liq;
      totalSeized += w.seized;
      liquidations += w.cnt;
      log.push({ step, round, liquidations: w.cnt, priceWad: price, liquidatedDebt: w.liq, seized: w.seized, deficit });
    }
    if (price === 0n) break;
  }
  const finalBase = mulDiv(p0, WAD - drop[s.steps - 1], WAD);
  const finalPrice = finalBase - mulDiv(finalBase - impact(finalBase, x0, x), feedback, BPS);

  // _badDebt (Kaskad.sol:466-484)
  let badDebt = 0n;
  let stuckDebt = 0n;
  for (let i = 0; i < n; i++) {
    const t = traces[i];
    t.coll = coll[i];
    t.debt = debt[i];
    const v = (coll[i] * finalPrice) / WAD + other[i];
    if (debt[i] > v) {
      badDebt += debt[i] - v;
      t.end = "bad-debt";
      t.shortfall = debt[i] - v;
    } else if (v * lt[i] < debt[i] * BPS) {
      stuckDebt += debt[i];
      t.end = "stuck";
    }
  }

  // KaskadMCv3.previewWithHidden: the same end state valued at the pool's spot price.
  const spotPrice = impact(finalBase, x0, x);
  let badDebtAtSpot = 0n;
  for (let i = 0; i < n; i++) {
    const v = (coll[i] * spotPrice) / WAD + other[i];
    if (debt[i] > v) badDebtAtSpot += debt[i] - v;
  }

  return {
    totalDebt,
    totalCollateral,
    totalLiquidated,
    totalSeized,
    badDebt,
    stuckDebt,
    startPrice: p0,
    finalPrice,
    spotPrice,
    badDebtAtSpot,
    hiddenBadDebt: badDebtAtSpot > badDebt ? badDebtAtSpot - badDebt : 0n,
    rounds: log.length,
    liquidations,
    positionsUsed: n,
    log,
    positions: traces,
  };
}
