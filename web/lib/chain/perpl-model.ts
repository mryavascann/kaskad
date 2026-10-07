// Perpl liquidation risk model (B6), pure: no network. Input is one market as read from the Perpl
// Exchange on Monad mainnet (lib/kaskad/perpl.ts); output is what the Perps panel draws.
//
// Perpl's mark price is clamped to ±0.25 % of the Chainlink spot index (docs.perpl.xyz, Price
// Indices), so liquidation selling barely moves it: there is no Aave-style price feedback loop. What
// a move does is (1) liquidate every position whose liquidation price it crosses, (2) sell those
// positions into the order book, and (3) where the book is too thin, close them past their
// bankruptcy price: the insurance fund pays the gap, and once it is empty the exchange
// auto-deleverages (ADL) profitable positions. That chain is what `stress()` replays.
//
// Formulas from PerplFoundation/dex-sdk crates/sdk/src/state/position.rs:
//   MMR = entry * size / MMF (MMF = maintMarginFracHdths / 100, e.g. 25 -> 4 %)
//   liq = entry + s * (MMR - deposit - premium) / size,  bankruptcy = entry - s * (deposit + premium) / size

export type Side = "long" | "short";

/** One open position, decimal units: price in USD, size in the base asset, collateral in AUSD. */
export type PerpPosition = {
  accountId: number;
  side: Side;
  entry: number;
  size: number;
  deposit: number;
  /** Unrealized funding PnL (premiumPnlCNS). */
  premium: number;
};

export type BookLevel = { price: number; size: number };

export type PerpMarket = {
  perpId: number;
  symbol: string;
  mark: number;
  oracle: number;
  /** Maintenance margin factor: liquidation at equity <= notional / mmf (25 -> 4 %). */
  mmf: number;
  insurance: number;
  /** Share of a liquidation's positive residual that goes to the insurance fund (0.1 = 10 %). */
  liqInsShare: number;
  oiLong: number;
  oiShort: number;
  positions: PerpPosition[];
  /** Best first. */
  bids: BookLevel[];
  asks: BookLevel[];
  block: number;
  at: number;
};

const sign = (side: Side) => (side === "long" ? 1 : -1);

export function maintenanceRequirement(p: PerpPosition, mmf: number): number {
  return (p.entry * p.size) / mmf;
}

/** Mark price at which the position is liquidated (0 floor). */
export function liquidationPrice(p: PerpPosition, mmf: number): number {
  return Math.max(0, p.entry + (sign(p.side) * (maintenanceRequirement(p, mmf) - p.deposit - p.premium)) / p.size);
}

/** Price at which the position's equity is zero (0 floor). */
export function bankruptcyPrice(p: PerpPosition): number {
  return Math.max(0, p.entry - (sign(p.side) * (p.deposit + p.premium)) / p.size);
}

/** Equity if closed at `price`: deposit + funding + price PnL. Negative = a loss the insurance fund covers. */
export function residualAt(p: PerpPosition, price: number): number {
  return p.deposit + p.premium + sign(p.side) * (price - p.entry) * p.size;
}

// ---------------------------------------------------------------------------------------------
// Heatmap: where liquidations sit.

export type HeatBin = {
  /** Move from the mark, in percent: -5 = the bin from -5 % to -4 %. */
  movePct: number;
  /** Bin bounds as prices. */
  from: number;
  to: number;
  positions: number;
  /** Notional at the liquidation price. */
  notional: number;
};

/**
 * Notional liquidated per 1 % of mark-price move, from -range to +range: longs below the mark,
 * shorts above. Positions beyond the range are not drawn (they are counted in `beyond`).
 */
export function heatmap(m: PerpMarket, rangePct = 30): { bins: HeatBin[]; beyond: { positions: number; notional: number } } {
  const bins: HeatBin[] = [];
  for (let k = -rangePct; k < rangePct; k++) {
    bins.push({ movePct: k, from: m.mark * (1 + k / 100), to: m.mark * (1 + (k + 1) / 100), positions: 0, notional: 0 });
  }
  const beyond = { positions: 0, notional: 0 };
  for (const p of m.positions) {
    const liq = liquidationPrice(p, m.mmf);
    const move = (liq / m.mark - 1) * 100;
    // 94000 / 100000 - 1 is -0.06000000000000005 in floating point: a price on a band edge stays in its band.
    const k = Math.floor(move + 1e-9);
    const bin = bins[k + rangePct];
    const notional = liq * p.size;
    if (bin && ((p.side === "long" && move < 0) || (p.side === "short" && move >= 0))) {
      bin.positions++;
      bin.notional += notional;
    } else {
      beyond.positions++;
      beyond.notional += notional;
    }
  }
  return { bins, beyond };
}

// ---------------------------------------------------------------------------------------------
// The book as a depth profile around its mid, moved with the price.

/** Cumulative size by distance from the mid, best first: [{ dist: 0.0012, cum: 3.4 }, ...]. */
export function depthProfile(levels: readonly BookLevel[], mid: number, side: "bid" | "ask"): { dist: number; size: number }[] {
  return levels.map((l) => ({ dist: side === "bid" ? 1 - l.price / mid : l.price / mid - 1, size: l.size }));
}

export function bookMid(m: Pick<PerpMarket, "bids" | "asks" | "mark">): number {
  const bid = m.bids[0]?.price;
  const ask = m.asks[0]?.price;
  return bid && ask ? (bid + ask) / 2 : m.mark;
}

export type StressStep = { price: number; liquidated: number; filled: number; unfilled: number; vwap: number };

export type StressResult = {
  /** Signed move of the mark, percent (-10 = ETH down 10 %). */
  movePct: number;
  positions: number;
  /** Notional of the liquidated positions at their liquidation price. */
  notional: number;
  /** Size the book absorbed within the band / handed to the backstop (base asset units). */
  filledSize: number;
  unfilledSize: number;
  /** Notional that found no order on the book (valued at the final price). */
  unfilledNotional: number;
  /** Size-weighted slippage of the fills against the mark of their step, in bps. */
  slippageBps: number;
  /** Losses beyond the positions' collateral, paid by the insurance fund (then by ADL). */
  deficit: number;
  /** Insurance fund after the move: fund + its share of positive residuals - deficit. */
  insuranceAfter: number;
  /** The fund cannot cover the deficit: Perpl auto-deleverages profitable positions. */
  adl: boolean;
  shortfall: number;
};

/**
 * How far from the mark a liquidation may fill on the book. Perpl's books carry stub orders far out
 * (BTC had a bid at $0.10); the exchange does not dump liquidations into them but hands what the
 * book cannot take to its backstop (Buy-to-Liquidate by the PLP vault, then the insurance fund and
 * ADL). The band is this model's assumption, shown on the panel.
 */
export const LIQ_BAND = 0.05;

/**
 * Replays a straight move of the mark price by `movePct` in `steps` blocks. Each block liquidates
 * the positions whose liquidation price the mark crossed and sells (longs) or buys back (shorts)
 * their size into today's book, moved with the mark: the book's depth profile around its mid is
 * re-centred on each step's price and consumed cumulatively (it does not refill during the move).
 * Only levels within `band` of the step's price take liquidations; the rest of the size goes to the
 * backstop at the band's edge, the best a backstop buyer would pay.
 */
export function stress(m: PerpMarket, movePct: number, steps = 20, band = LIQ_BAND): StressResult {
  const down = movePct < 0;
  const side: Side = down ? "long" : "short";
  const mid = bookMid(m);
  const profile = depthProfile(down ? m.bids : m.asks, mid, down ? "bid" : "ask").filter((l) => l.dist <= band);
  const remaining = profile.map((l) => l.size);

  const book = m.positions
    .filter((p) => p.side === side)
    .map((p) => ({ p, liq: liquidationPrice(p, m.mmf) }))
    .sort((a, b) => (down ? b.liq - a.liq : a.liq - b.liq));

  let next = 0;
  let positions = 0;
  let notional = 0;
  let filledSize = 0;
  let unfilledSize = 0;
  let unfilledNotional = 0;
  let slipWeighted = 0;
  let deficit = 0;
  let insurance = m.insurance;

  for (let k = 1; k <= steps; k++) {
    const price = m.mark * (1 + (movePct / 100) * (k / steps));
    const batch: typeof book = [];
    while (next < book.length && (down ? book[next].liq >= price : book[next].liq <= price)) batch.push(book[next++]);
    if (batch.length === 0) continue;

    let want = batch.reduce((s, b) => s + b.p.size, 0);
    let cost = 0; // sum of size * distance from the step's price
    let got = 0;
    for (let i = 0; i < remaining.length && want > 0; i++) {
      const take = Math.min(remaining[i], want);
      remaining[i] -= take;
      want -= take;
      got += take;
      cost += take * profile[i].dist;
    }
    const filledDist = got > 0 ? cost / got : 0;
    const unfilled = want;
    const total = got + unfilled;
    // One average exit price for the batch: the filled part at its VWAP, the rest at the band's edge.
    const avgDist = total > 0 ? (cost + unfilled * band) / total : 0;
    const exit = down ? price * (1 - avgDist) : price * (1 + avgDist);

    filledSize += got;
    unfilledSize += unfilled;
    unfilledNotional += unfilled * price;
    slipWeighted += got * filledDist * 10_000;
    for (const { p, liq } of batch) {
      positions++;
      notional += liq * p.size;
      const r = residualAt(p, exit);
      if (r >= 0) insurance += r * m.liqInsShare;
      else deficit -= r;
    }
  }
  insurance -= deficit;
  return {
    movePct,
    positions,
    notional,
    filledSize,
    unfilledSize,
    unfilledNotional,
    slippageBps: filledSize > 0 ? slipWeighted / filledSize : 0,
    deficit,
    insuranceAfter: insurance,
    adl: insurance < 0,
    shortfall: insurance < 0 ? -insurance : 0,
  };
}

/** The standard moves of the panel, both directions. */
export const STRESS_MOVES = [-5, -10, -15, -20, -30, 5, 10, 15, 20, 30] as const;

/**
 * Smallest move (1 % steps up to `maxPct`) in each direction at which the insurance fund runs out
 * and ADL starts; null when it holds over the whole range.
 */
export function adlThreshold(m: PerpMarket, maxPct = 50): { down: number | null; up: number | null } {
  const find = (dir: -1 | 1) => {
    for (let k = 1; k <= maxPct; k++) if (stress(m, dir * k).adl) return dir * k;
    return null;
  };
  return { down: find(-1), up: find(1) };
}

/** Same for the order book: the smallest move whose liquidations the book can no longer absorb within the band. */
export function bookExhaustion(m: PerpMarket, maxPct = 50): { down: number | null; up: number | null } {
  const find = (dir: -1 | 1) => {
    for (let k = 1; k <= maxPct; k++) if (stress(m, dir * k).unfilledSize > 0) return dir * k;
    return null;
  };
  return { down: find(-1), up: find(1) };
}
