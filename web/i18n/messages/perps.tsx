/**
 * Copy of /perps and /tr/perps: the Perpl liquidation risk panel. Every number is a parameter read
 * live from Perpl on Monad mainnet (app/api/perpl) and run through lib/chain/perpl-model.ts.
 */
import type { ReactNode } from "react";
import type { Locale } from "../config";

type S = string;
const accent = (s: string) => <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">{s}</em>;

const en = {
  meta: {
    title: "Perps risk",
    description: "Live liquidation map of Perpl on Monad: where every open position would be liquidated, what the order book can absorb, and when the insurance fund would run out.",
  },
  hero: {
    kicker: "Perpl · Monad mainnet · live",
    title: (<>Where Perpl's liquidations sit, and what {accent("catches")} them.</>) as ReactNode,
    lead: "Every open position on Perpl, read from its contract on Monad mainnet with the order book from Perpl's API, refreshed every ten seconds. For each move of the price: which positions are liquidated, how much the book absorbs, what is left for Perpl's backstop, and whether the insurance fund holds.",
  },
  market: "Market",
  live: {
    mark: "Mark price",
    oracle: "Spot index (Chainlink)",
    oi: "Open interest",
    oiValue: (v: { long: S; short: S }) => `${v.long} long · ${v.short} short`,
    insurance: "Insurance fund",
    positions: "Open positions",
    near: (v: { n: S }) => `${v.n} within 5% of liquidation`,
    updated: (v: { seconds: S; block: S }) => `Read ${v.seconds} s ago · block ${v.block}`,
    reading: "Reading Perpl…",
    error: "Perpl could not be read right now. The panel retries every ten seconds.",
  },
  heat: {
    title: "Liquidation map",
    lead: "Notional that would be liquidated in each 1% band of price movement from the mark: longs below, shorts above.",
    chart: (v: { symbol: S }) => `${v.symbol}: notional liquidated per 1% of price movement, −30% to +30% from the mark`,
    longs: "Longs liquidated",
    shorts: "Shorts liquidated",
    beyond: (v: { n: S; usd: S }) => `${v.n} positions (${v.usd}) would only be liquidated beyond ±30%.`,
    table: { summary: "Data table", move: "Move", price: "Price", positions: "Positions", notional: "Notional" },
  },
  verdict: {
    title: "What catches them",
    depth: (v: { bids: S; asks: S }) => `Within 5% of the mark the book holds ${v.bids} of bids and ${v.asks} of asks.`,
    bookDown: (v: { move: S }) => `From a ${v.move} drop, the longs being liquidated need more than those bids: the rest goes to Perpl's backstop.`,
    bookUp: (v: { move: S }) => `From a ${v.move} rise, the shorts being liquidated need more than those asks.`,
    bookHolds: "Up to ±50%, the book absorbs every liquidation within 5% of the mark.",
    adlNone: (v: { fund: S }) => `The insurance fund (${v.fund}) covers every deficit up to ±50%: no auto-deleveraging.`,
    adlAt: (v: { fund: S; move: S }) => `The insurance fund (${v.fund}) runs out at a ${v.move} move: from there Perpl auto-deleverages profitable positions.`,
  },
  stress: {
    title: "Price moves",
    lead: "Each row moves the mark in a straight line over 20 blocks and liquidates every position it crosses.",
    move: "Move",
    positions: "Liquidated",
    notional: "Notional",
    absorbed: "Absorbed by the book",
    backstop: "To the backstop",
    deficit: "Beyond collateral",
    fund: "Insurance fund after",
    adl: "ADL",
  },
  assumptions: {
    title: "How this is computed",
    items: [
      "Liquidation price per position, from Perpl's own SDK: entry + side × (maintenance requirement − deposit − funding) / size, with the market's maintenance margin read from the contract. No open position is past it at the current mark.",
      "Perpl's mark price is held within ±0.25% of the Chainlink spot index, so liquidation selling barely moves it: unlike Aave, there is no price feedback loop. The risk is the book, not the price.",
      "The book is today's book, moved with the price and not refilled during the move. Liquidations fill only within 5% of the mark (this panel's assumption): Perpl's books carry stub orders far out, and size the book cannot take goes to the backstop, here at that 5% edge.",
      "Positions are liquidated in full; funding is frozen at its current value. 10% of every positive residual goes to the insurance fund, as the contract's liquidation split says.",
    ],
    sources: "Sources",
    contract: "Perpl Exchange on MonadScan",
    api: "Perpl API",
  },
};

export type PerpsMessages = typeof en;

const tr = {
  meta: {
    title: "Perps riski",
    description: "Monad'daki Perpl'ın canlı likidasyon haritası: her açık pozisyon nerede likide olur, order book ne kadarını karşılar, sigorta fonu ne zaman tükenir.",
  },
  hero: {
    kicker: "Perpl · Monad mainnet · canlı",
    title: (<>Perpl'ın likidasyonları nerede, onları ne {accent("karşılıyor")}?</>) as ReactNode,
    lead: "Perpl'daki her açık pozisyon, Monad mainnet'teki kontratından, order book ise Perpl'ın API'sinden okunuyor; on saniyede bir yenileniyor. Fiyatın her hareketi için: hangi pozisyonlar likide olur, book ne kadarını karşılar, Perpl'ın yedek mekanizmasına ne kalır ve sigorta fonu dayanır mı.",
  },
  market: "Piyasa",
  live: {
    mark: "Mark fiyatı",
    oracle: "Spot endeks (Chainlink)",
    oi: "Açık pozisyon",
    oiValue: (v: { long: S; short: S }) => `${v.long} long · ${v.short} short`,
    insurance: "Sigorta fonu",
    positions: "Açık pozisyon sayısı",
    near: (v: { n: S }) => `${v.n} tanesi likidasyona %5'ten yakın`,
    updated: (v: { seconds: S; block: S }) => `${v.seconds} sn önce okundu · blok ${v.block}`,
    reading: "Perpl okunuyor…",
    error: "Perpl şu an okunamadı. Panel on saniyede bir yeniden deniyor.",
  },
  heat: {
    title: "Likidasyon haritası",
    lead: "Mark fiyatından her %1'lik fiyat hareketinde likide olacak nominal: long'lar aşağıda, short'lar yukarıda.",
    chart: (v: { symbol: S }) => `${v.symbol}: %1'lik fiyat hareketi başına likide olan nominal, mark fiyatından −%30 ile +%30 arası`,
    longs: "Likide olan long'lar",
    shorts: "Likide olan short'lar",
    beyond: (v: { n: S; usd: S }) => `${v.n} pozisyon (${v.usd}) ancak ±%30'un ötesinde likide olur.`,
    table: { summary: "Veri tablosu", move: "Hareket", price: "Fiyat", positions: "Pozisyon", notional: "Nominal" },
  },
  verdict: {
    title: "Onları ne karşılıyor",
    depth: (v: { bids: S; asks: S }) => `Mark fiyatının %5 yakınında book'ta ${v.bids} alış ve ${v.asks} satış emri var.`,
    bookDown: (v: { move: S }) => `${v.move} düşüşten itibaren likide olan long'lar bu alışlardan fazlasını istiyor: geri kalanı Perpl'ın yedek mekanizmasına gidiyor.`,
    bookUp: (v: { move: S }) => `${v.move} yükselişten itibaren likide olan short'lar bu satışlardan fazlasını istiyor.`,
    bookHolds: "±%50'ye kadar book, her likidasyonu mark fiyatının %5 yakınında karşılıyor.",
    adlNone: (v: { fund: S }) => `Sigorta fonu (${v.fund}) ±%50'ye kadar her açığı karşılıyor: otomatik kaldıraç azaltma (ADL) yok.`,
    adlAt: (v: { fund: S; move: S }) => `Sigorta fonu (${v.fund}) ${v.move} harekette tükeniyor: oradan sonra Perpl kârdaki pozisyonları otomatik olarak kapatıyor (ADL).`,
  },
  stress: {
    title: "Fiyat hareketleri",
    lead: "Her satır mark fiyatını 20 blokta düz bir çizgiyle hareket ettiriyor ve geçtiği her pozisyonu likide ediyor.",
    move: "Hareket",
    positions: "Likide olan",
    notional: "Nominal",
    absorbed: "Book'un karşıladığı",
    backstop: "Yedek mekanizmaya",
    deficit: "Teminatın ötesinde",
    fund: "Sonrasında sigorta fonu",
    adl: "ADL",
  },
  assumptions: {
    title: "Nasıl hesaplanıyor",
    items: [
      "Her pozisyonun likidasyon fiyatı Perpl'ın kendi SDK'sındaki formülle: giriş + yön × (bakım teminatı − teminat − funding) / büyüklük; piyasanın bakım teminatı kontrattan okunuyor. Şu anki mark fiyatında hiçbir açık pozisyon bu fiyatı geçmiş değil.",
      "Perpl'ın mark fiyatı Chainlink spot endeksinin ±%0,25'i içinde tutuluyor; likidasyon satışları onu neredeyse hiç oynatmıyor. Aave'nin aksine fiyat geri besleme döngüsü yok: risk fiyatta değil, book'ta.",
      "Book bugünkü book; fiyatla birlikte kayıyor, hareket sırasında yeniden dolmuyor. Likidasyonlar yalnızca mark fiyatının %5 yakınında doluyor (bu panelin varsayımı): Perpl'ın book'larında çok uzakta duran sembolik emirler var; book'un alamadığı kısım yedek mekanizmaya, burada o %5 sınırından gidiyor.",
      "Pozisyonlar tamamen likide ediliyor; funding şu anki değerinde sabit. Kontrattaki likidasyon paylaşımına göre her pozitif kalanın %10'u sigorta fonuna gidiyor.",
    ],
    sources: "Kaynaklar",
    contract: "MonadScan'de Perpl Exchange",
    api: "Perpl API",
  },
} satisfies PerpsMessages;

export const perpsMessages: Record<Locale, PerpsMessages> = { en, tr };
