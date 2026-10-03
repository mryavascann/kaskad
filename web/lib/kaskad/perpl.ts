// Perpl (perpetual futures on Monad) market reader for the Perps risk panel (B6). Server side: the
// mainnet RPC key never reaches the browser (app/api/perpl/route.ts).
//
// - Every open position, the market's margin and liquidation parameters and its insurance fund:
//   Perpl Exchange view functions on Monad mainnet (getPositionsV2, getMarginFractions,
//   getPerpetualInfoV2, getLiquidationInfo). Public, no API key.
// - The L2 order book: Perpl's public REST API (GET /v1/market-data/:id/book), no API key.
// Units follow PerplFoundation/dex-sdk: prices scaled by priceDecimals, sizes by lotDecimals,
// collateral (AUSD) by 6 decimals; margins in hundredths.

import type { Address, PublicClient } from "viem";
import type { BookLevel, PerpMarket, PerpPosition } from "@/lib/chain/perpl-model";
import { perplExchangeAbi } from "./perpl-abi";

export const PERPL_EXCHANGE: Address = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";
export const PERPL_API = "https://app.perpl.xyz/api";
export const PERPL_APP = "https://app.perpl.xyz";

/** Mainnet markets (api-docs README): perpetual id by symbol, in the panel's order. */
export const PERPL_MARKETS = [
  { symbol: "BTC", perpId: 1 },
  { symbol: "ETH", perpId: 20 },
  { symbol: "SOL", perpId: 31 },
  { symbol: "MON", perpId: 10 },
  { symbol: "HYPE", perpId: 40 },
  { symbol: "ZEC", perpId: 50 },
] as const;
export type PerplSymbol = (typeof PERPL_MARKETS)[number]["symbol"];
export const isPerplSymbol = (s: string): s is PerplSymbol => PERPL_MARKETS.some((m) => m.symbol === s);

const COLLATERAL_DECIMALS = 6;
/** One call returns the whole market: getPositionsV2 pads to the page size and reports the count. */
const PAGE = 2_000n;

type RawPosition = {
  accountId: bigint;
  nextNodeId: bigint;
  positionType: number;
  depositCNS: bigint;
  pricePNS: bigint;
  lotLNS: bigint;
  premiumPnlCNS: bigint;
  priceResiduePNSQ16: bigint;
};

/** dex-sdk Position::effective_entry_price: longs round up, shorts down, plus a 16-bit residue. */
export function effectiveEntry(type: number, pricePNS: bigint, residue: bigint): number {
  const r = Number(residue) / 65_536;
  if (type === 0) return residue > 0n ? Number(pricePNS) - 1 + r : Number(pricePNS);
  return Number(pricePNS) + r;
}

export function toPosition(raw: RawPosition, priceScale: number, lotScale: number): PerpPosition {
  return {
    accountId: Number(raw.accountId),
    side: raw.positionType === 0 ? "long" : "short",
    entry: effectiveEntry(raw.positionType, raw.pricePNS, raw.priceResiduePNSQ16) / priceScale,
    size: Number(raw.lotLNS) / lotScale,
    deposit: Number(raw.depositCNS) / 10 ** COLLATERAL_DECIMALS,
    premium: Number(raw.premiumPnlCNS) / 10 ** COLLATERAL_DECIMALS,
  };
}

type BookJson = { at?: { b?: number; t?: number }; bid?: { p: number; s: number }[]; ask?: { p: number; s: number }[] };

export function toLevels(levels: BookJson["bid"], priceScale: number, lotScale: number): BookLevel[] {
  return (levels ?? []).filter((l) => l.s > 0).map((l) => ({ price: l.p / priceScale, size: l.s / lotScale }));
}

/** One market, read once: ~4 eth_calls (one block) and one REST call. */
export async function readPerplMarket(client: Pick<PublicClient, "readContract" | "getBlockNumber">, perpId: number, fetcher: typeof fetch = fetch): Promise<PerpMarket> {
  const block = await client.getBlockNumber();
  const id = BigInt(perpId);
  const read = <T>(functionName: string, args: readonly unknown[]) =>
    client.readContract({ address: PERPL_EXCHANGE, abi: perplExchangeAbi, functionName, args, blockNumber: block } as never) as Promise<T>;
  const [info, [maintFrac], liq, [raw, count]] = await Promise.all([
    read<{ symbol: string; priceDecimals: bigint; lotDecimals: bigint; markPNS: bigint; oraclePNS: bigint; insuranceBalanceCNS: bigint; longOpenInterestLNS: bigint; shortOpenInterestLNS: bigint }>(
      "getPerpetualInfoV2",
      [id],
    ),
    read<readonly [bigint, bigint]>("getMarginFractions", [id, 0n]).then((r) => [r[1]] as const),
    read<{ liqInsAmtPer100K: bigint }>("getLiquidationInfo", [id]),
    read<readonly [readonly RawPosition[], bigint]>("getPositionsV2", [id, 0n, PAGE]),
  ]);
  if (count >= PAGE) throw new Error(`perp ${perpId}: more than ${PAGE} positions`);
  const priceScale = 10 ** Number(info.priceDecimals);
  const lotScale = 10 ** Number(info.lotDecimals);

  const res = await fetcher(`${PERPL_API}/v1/market-data/${perpId}/book`, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`perpl book ${perpId}: HTTP ${res.status}`);
  const book = (await res.json()) as BookJson;

  return {
    perpId,
    symbol: info.symbol.replace(/_v\d+$/, ""),
    mark: Number(info.markPNS) / priceScale,
    oracle: Number(info.oraclePNS) / priceScale,
    mmf: Number(maintFrac) / 100,
    insurance: Number(info.insuranceBalanceCNS) / 10 ** COLLATERAL_DECIMALS,
    liqInsShare: Number(liq.liqInsAmtPer100K) / 100_000,
    oiLong: Number(info.longOpenInterestLNS) / lotScale,
    oiShort: Number(info.shortOpenInterestLNS) / lotScale,
    positions: raw.slice(0, Number(count)).map((p) => toPosition(p, priceScale, lotScale)),
    bids: toLevels(book.bid, priceScale, lotScale),
    asks: toLevels(book.ask, priceScale, lotScale),
    block: Number(block),
    at: book.at?.t ?? Date.now(),
  };
}
