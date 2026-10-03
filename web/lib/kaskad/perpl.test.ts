import { describe, expect, it, vi } from "vitest";
import { effectiveEntry, isPerplSymbol, PERPL_API, PERPL_EXCHANGE, readPerplMarket, toLevels, toPosition } from "./perpl";

describe("units (PerplFoundation/dex-sdk)", () => {
  it("effective entry price: longs round up, shorts down, plus the 16-bit residue", () => {
    expect(effectiveEntry(0, 697_422n, 0n)).toBe(697_422);
    expect(effectiveEntry(0, 697_422n, 32_768n)).toBe(697_421.5);
    expect(effectiveEntry(1, 697_422n, 16_384n)).toBe(697_422.25);
  });

  it("scales prices, sizes and AUSD collateral to decimals", () => {
    const p = toPosition(
      { accountId: 6n, nextNodeId: 88n, positionType: 0, depositCNS: 41_612_829n, pricePNS: 697_422n, lotLNS: 179n, premiumPnlCNS: -2_153_795n, priceResiduePNSQ16: 0n },
      10,
      100_000,
    );
    expect(p).toEqual({ accountId: 6, side: "long", entry: 69_742.2, size: 0.00179, deposit: 41.612829, premium: -2.153795 });
    expect(toLevels([{ p: 848_000, s: 1_838 }, { p: 1, s: 0 }], 10, 100_000)).toEqual([{ price: 84_800, size: 0.01838 }]);
    expect(isPerplSymbol("BTC")).toBe(true);
    expect(isPerplSymbol("DOGE")).toBe(false);
  });
});

describe("readPerplMarket", () => {
  it("reads one block of the Exchange and the REST book; the padded page is cut at the reported count", async () => {
    const position = { accountId: 6n, nextNodeId: 0n, positionType: 1, depositCNS: 10_000_000n, pricePNS: 850_000n, lotLNS: 10_000n, premiumPnlCNS: 0n, priceResiduePNSQ16: 0n };
    const empty = { ...position, accountId: 0n, lotLNS: 0n };
    const readContract = vi.fn(async ({ functionName, blockNumber, address }: { functionName: string; blockNumber: bigint; address: string }) => {
      expect(blockNumber).toBe(110_000_000n);
      expect(address).toBe(PERPL_EXCHANGE);
      switch (functionName) {
        case "getPerpetualInfoV2":
          return { symbol: "SOL_v2", priceDecimals: 1n, lotDecimals: 5n, markPNS: 847_656n, oraclePNS: 847_236n, insuranceBalanceCNS: 178_648_725_122n, longOpenInterestLNS: 968_503n, shortOpenInterestLNS: 968_503n };
        case "getMarginFractions":
          return [1_500n, 2_500n, 1_500n, 30_000_000n, 90n, 95n];
        case "getLiquidationInfo":
          return { liqInsAmtPer100K: 10_000n };
        case "getPositionsV2":
          return [[position, empty, empty], 1n, 847_656n, true];
      }
      throw new Error(functionName);
    });
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe(`${PERPL_API}/v1/market-data/31/book`);
      return new Response(JSON.stringify({ at: { b: 1, t: 1_791_070_214_000 }, bid: [{ p: 848_000, s: 1_838 }], ask: [{ p: 848_010, s: 200 }] }));
    });
    const m = await readPerplMarket({ readContract, getBlockNumber: async () => 110_000_000n } as never, 31, fetcher as never);
    expect(m).toMatchObject({
      perpId: 31,
      symbol: "SOL",
      mark: 84_765.6,
      mmf: 25,
      insurance: 178_648.725122,
      liqInsShare: 0.1,
      oiLong: 9.68503,
      block: 110_000_000,
      at: 1_791_070_214_000,
    });
    expect(m.positions).toEqual([{ accountId: 6, side: "short", entry: 85_000, size: 0.1, deposit: 10, premium: 0 }]);
    expect(m.bids).toEqual([{ price: 84_800, size: 0.01838 }]);
  });

  it("fails loudly when the book cannot be read", async () => {
    const readContract = vi.fn(async ({ functionName }: { functionName: string }) =>
      functionName === "getPositionsV2" ? [[], 0n, 0n, true] : functionName === "getMarginFractions" ? [0n, 2_500n] : { symbol: "BTC", priceDecimals: 1n, lotDecimals: 5n, liqInsAmtPer100K: 0n },
    );
    await expect(readPerplMarket({ readContract, getBlockNumber: async () => 1n } as never, 1, (async () => new Response("", { status: 503 })) as never)).rejects.toThrow("HTTP 503");
  });
});
