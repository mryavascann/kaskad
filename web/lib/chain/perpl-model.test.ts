import { describe, expect, it } from "vitest";
import {
  adlThreshold,
  bankruptcyPrice,
  bookExhaustion,
  heatmap,
  LIQ_BAND,
  liquidationPrice,
  residualAt,
  stress,
  type PerpMarket,
  type PerpPosition,
} from "./perpl-model";

const pos = (over: Partial<PerpPosition> = {}): PerpPosition => ({ accountId: 1, side: "long", entry: 100_000, size: 1, deposit: 10_000, premium: 0, ...over });

const market = (over: Partial<PerpMarket> = {}): PerpMarket => ({
  perpId: 1,
  symbol: "BTC",
  mark: 100_000,
  oracle: 100_000,
  mmf: 25, // 4 % maintenance margin, BTC on Perpl
  insurance: 1_000,
  liqInsShare: 0.1,
  oiLong: 1,
  oiShort: 0,
  positions: [pos()],
  bids: [{ price: 99_990, size: 10 }],
  asks: [{ price: 100_010, size: 10 }],
  block: 1,
  at: 0,
  ...over,
});

describe("liquidation and bankruptcy prices (dex-sdk position.rs)", () => {
  it("Perpl's own example: a $100k BTC long at 10x is liquidated at $94,000 with $4,000 left", () => {
    const p = pos();
    expect(liquidationPrice(p, 25)).toBe(94_000);
    expect(bankruptcyPrice(p)).toBe(90_000);
    expect(residualAt(p, 94_000)).toBe(4_000);
  });

  it("shorts mirror longs; funding PnL moves both prices; prices never go below zero", () => {
    const s = pos({ side: "short" });
    expect(liquidationPrice(s, 25)).toBe(106_000);
    expect(bankruptcyPrice(s)).toBe(110_000);
    expect(liquidationPrice(pos({ premium: 1_000 }), 25)).toBe(93_000);
    expect(liquidationPrice(pos({ deposit: 200_000 }), 25)).toBe(0);
  });
});

describe("heatmap", () => {
  it("puts each position in the 1 % band of its liquidation price; longs below the mark, shorts above", () => {
    const m = market({ positions: [pos(), pos({ side: "short" }), pos({ deposit: 50_000 })] });
    const { bins, beyond } = heatmap(m, 10);
    expect(bins).toHaveLength(20);
    expect(bins.find((b) => b.movePct === -6)).toMatchObject({ positions: 1, notional: 94_000 });
    expect(bins.find((b) => b.movePct === 6)).toMatchObject({ positions: 1, notional: 106_000 });
    expect(beyond).toEqual({ positions: 1, notional: liquidationPrice(pos({ deposit: 50_000 }), 25) });
  });
});

describe("stress", () => {
  it("a small move liquidates nothing", () => {
    expect(stress(market(), -5)).toMatchObject({ positions: 0, notional: 0, deficit: 0, insuranceAfter: 1_000, adl: false });
  });

  it("a deep book absorbs the liquidation; 10 % of the residual goes to the insurance fund", () => {
    const r = stress(market({ bids: [{ price: 99_990, size: 5 }] }), -10);
    expect(r).toMatchObject({ positions: 1, filledSize: 1, unfilledSize: 0, deficit: 0, adl: false });
    // Liquidated on the first step at or below $94,000 (-6.5 % on a 20-step path to -10 %), 1 bp of slippage.
    expect(r.slippageBps).toBeCloseTo(1, 5);
    expect(r.insuranceAfter).toBeGreaterThan(1_000);
  });

  it("what the book cannot take within the band goes to the backstop at the band's edge", () => {
    const m = market({ bids: [{ price: 99_990, size: 0.25 }, { price: 50_000, size: 100 }] }); // the $50k bid is a stub, far outside 5 %
    const r = stress(m, -10);
    expect(r.filledSize).toBeCloseTo(0.25, 10);
    expect(r.unfilledSize).toBeCloseTo(0.75, 10);
    expect(r.unfilledNotional).toBeGreaterThan(0);
    // Exit = 0.25 at -1 bp, 0.75 at -5 % from the step price: still above bankruptcy ($90k), no deficit.
    expect(r.deficit).toBe(0);
  });

  it("losses beyond collateral come out of the insurance fund; ADL once it is empty", () => {
    const thin = market({ bids: [], positions: [pos({ deposit: 6_000 })] }); // liq $98k, bankrupt $94k
    const r = stress(thin, -30, 20);
    // Liquidated at the first step at or below $98k (-3 %, $97,000), closed 5 % lower: $92,150 < $94k.
    expect(r.deficit).toBeCloseTo(94_000 - 97_000 * (1 - LIQ_BAND), 6);
    expect(r.insuranceAfter).toBeCloseTo(1_000 - r.deficit, 6);
    expect(r.adl).toBe(true);
    expect(r.shortfall).toBeCloseTo(r.deficit - 1_000, 6);
    // On a 20-step path a k % move first reaches $98k at step ceil(40 / k); its price, minus the 5 %
    // band, decides the deficit. -9 % is the first move whose deficit ($1,137.50) exceeds the $1,000 fund.
    expect(adlThreshold(thin, 10)).toEqual({ down: -9, up: null });
    // With no bids at all, the first move that liquidates anything (-2 %, ending at $98k) hits the backstop.
    expect(bookExhaustion(thin, 10)).toEqual({ down: -2, up: null });
  });

  it("a rise liquidates shorts against the asks", () => {
    const m = market({ positions: [pos({ side: "short" })], asks: [{ price: 100_010, size: 5 }] });
    expect(stress(m, 10)).toMatchObject({ positions: 1, filledSize: 1, deficit: 0 });
    expect(stress(m, -10).positions).toBe(0);
  });
});
