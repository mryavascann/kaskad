/**
 * Copy of /replay and /tr/10-ekim. Every number is a parameter: the page reads them from
 * lib/chain/oct10-replay.json (built from our own Ethereum reads by scripts/src/replay).
 */
import type { ReactNode } from "react";
import type { Locale } from "../config";

type S = string;
const accent = (s: string) => <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">{s}</em>;

const en = {
  meta: {
    title: "10 October replay",
    description: "Kaskad's engine on the real Aave V3 Ethereum book of 10 October 2025, against every liquidation Aave executed that night.",
  },
  hero: {
    kicker: "Replay · 10 October 2025",
    title: (<>What Kaskad would have {accent("seen")} on 10 October.</>) as ReactNode,
    lead: (v: { drop: S; total: S }) =>
      `On 10 October 2025 ETH fell ${v.drop} in thirty minutes and Aave V3 Ethereum liquidated ${v.total} of debt in one night. We read the WETH-backed book at the last block before the fall, ran it through Kaskad's engine with the price Aave itself used, and compared the result with every liquidation Aave executed.`,
    sources: "Every number on this page comes from our own reads of Ethereum, not from news reports.",
  },
  night: {
    title: "The night, from the chain",
    price: (v: { from: S; to: S; at: S; drop: S }) => `ETH/USD on Aave's oracle (Chainlink): ${v.from} before the fall, ${v.to} at ${v.at} UTC, −${v.drop}.`,
    liquidations: (v: { count: S; total: S }) => `${v.count} liquidations on Aave V3 Ethereum between 20:00 and 06:00 UTC, ${v.total} of debt repaid.`,
    weth: (v: { count: S; total: S; share: S }) => `${v.count} of them against WETH collateral, ${v.total}; ${v.share} of that in the half hour of the crash.`,
    usde: (v: { source: S; price: S; count: S }) =>
      `Aave did not price USDe from any market: its source was “${v.source}”, at ${v.price} before the fall and at the low. All night, ${v.count} liquidations touched USDe or sUSDe. Whatever USDe traded at elsewhere never reached Aave's books: the gap Kaskad calls hidden bad debt.`,
    chart: "Chainlink ETH/USD and debt liquidated on Aave every 2 minutes, 20:30–22:30 UTC",
    priceAxis: "ETH/USD",
    barsAxis: "Liquidated per 2 min",
    table: { summary: "Data table", time: "Time (UTC)", price: "ETH/USD", all: "Liquidated, all collateral", weth: "Liquidated, WETH collateral" },
  },
  compare: {
    title: "Kaskad against Aave",
    scenario: (v: { positions: S; debt: S; block: S; shock: S; low: S }) =>
      `Book: ${v.positions} WETH-backed positions, ${v.debt} of debt, block ${v.block}. Shock: −${v.shock} to ${v.low} (the Chainlink low), oracle following the external price, 100 blocks.`,
    head: { metric: "", kaskad: "Kaskad (predicted)", aave: "Aave (actual)" },
    debt: "Debt liquidated",
    positions: "Positions liquidated",
    headline: (v: { predicted: S; actual: S; diff: S }) =>
      `Leaving out the positions that defended themselves, Kaskad predicted ${v.predicted} against ${v.actual} that Aave actually liquidated: ${v.diff}.`,
    whyTitle: "Where they differ, and why",
    matched: (v: { n: S; actual: S; predicted: S }) => `${v.n} positions were liquidated in both: ${v.actual} on Aave, ${v.predicted} in Kaskad.`,
    defended: (v: { n: S; usd: S }) => `${v.n} positions Kaskad liquidates repaid debt or added collateral in the half hour before the low (${v.usd}). Kaskad assumes nobody reacts.`,
    unliquidated: (v: { n: S; usd: S }) => `${v.n} were still under water at the low, and no liquidator came (${v.usd}).`,
    model: (v: { n: S; usd: S }) => `${v.n} the model simply got wrong (${v.usd}).`,
    multiAsset: (v: { n: S; usd: S; other: S; assets: S; stables: boolean }) =>
      `${v.n} positions Aave liquidated and Kaskad did not (${v.usd}): ${v.other} of that was repaid against collateral other than WETH (${v.assets}${v.stables ? ", and stablecoins" : ""}). Those positions held other assets that fell with ETH, while Kaskad shocks one asset at a time.`,
    outside: (v: { n: S; usd: S }) => `${v.n} WETH-collateral liquidations (${v.usd}) hit positions outside this book: their largest collateral was not WETH.`,
  },
  curve: {
    title: "The same book, other shocks",
    lead: "Kaskad's prediction for this book over a range of drops. The highlighted row is the night's drop.",
    shock: "ETH drop",
    debt: "Debt liquidated",
    positions: "Positions",
    thisNight: "this night",
  },
  assumptions: {
    title: "Assumptions",
    scope: (v: { loops: S; loopsDebt: S }) =>
      `Book: borrowers whose largest collateral is WETH. ${v.loops} ETH-on-ETH loops (${v.loopsDebt} of debt) are left out: an ETH move changes both sides of such a loop, while Kaskad keeps debt fixed in dollars. Dust below $100 is left out too.`,
    depth: (v: { depth: S; same: S }) =>
      `Pool depth ${v.depth} is today's Ethereum ETH/stablecoin DEX depth, not that night's. At this size it barely matters: 20, 50 and 100 blocks all give ${v.same}.`,
    recovery: "Arbitrage recovery between blocks: 90%, as for the WETH (Ethereum) book in the console.",
    other: "Other collateral is held at its dollar value. That is the main source of the positions Kaskad missed.",
    method: "Scripts: scripts/src/replay (events, book, trough, compare). Engine: web/lib/chain/replay.ts, the exact off-chain mirror of the on-chain engine.",
    bookBlock: "Book block on Etherscan",
    lowBlock: "Chainlink low on Etherscan",
  },
  cta: "Stress-test today's books in the console",
};

export type ReplayMessages = typeof en;

const tr = {
  meta: {
    title: "10 Ekim replay'i",
    description: "Kaskad motoru 10 Ekim 2025'teki gerçek Aave V3 Ethereum defterinde; o gece Aave'nin yaptığı her likidasyonla karşılaştırmalı.",
  },
  hero: {
    kicker: "Replay · 10 Ekim 2025",
    title: (<>Kaskad 10 Ekim'de neyi {accent("görürdü")}?</>) as ReactNode,
    lead: (v: { drop: S; total: S }) =>
      `10 Ekim 2025'te ETH otuz dakikada ${v.drop} düştü; Aave V3 Ethereum tek gecede ${v.total} borcu likide etti. WETH teminatlı defteri düşüşten önceki son blokta okuduk, Aave'nin kendi kullandığı fiyatla Kaskad motorunda çalıştırdık ve sonucu Aave'nin yaptığı her likidasyonla karşılaştırdık.`,
    sources: "Bu sayfadaki her rakam Ethereum'dan kendi okuduğumuz verilerden geliyor, haber kaynaklarından değil.",
  },
  night: {
    title: "O gece, zincirden",
    price: (v: { from: S; to: S; at: S; drop: S }) => `Aave oracle'ında ETH/USD (Chainlink): düşüşten önce ${v.from}, ${v.at} UTC'de ${v.to}, −${v.drop}.`,
    liquidations: (v: { count: S; total: S }) => `Aave V3 Ethereum'da 20:00–06:00 UTC arasında ${v.count} likidasyon, ${v.total} borç geri ödendi.`,
    weth: (v: { count: S; total: S; share: S }) => `Bunların ${v.count} tanesi WETH teminatına karşı, ${v.total}; bunun ${v.share} kadarı çöküşün yarım saatinde.`,
    usde: (v: { source: S; price: S; count: S }) =>
      `Aave USDe'yi hiçbir piyasadan fiyatlamıyordu: kaynağı “${v.source}” idi; düşüşten önce de dipte de ${v.price}. Bütün gece USDe ya da sUSDe'ye dokunan ${v.count} likidasyon oldu. USDe başka yerlerde kaçtan işlem görürse görsün, Aave'nin defterine hiç yansımadı: Kaskad'ın gizli karşılıksız borç dediği fark bu.`,
    chart: "Chainlink ETH/USD ve Aave'de 2 dakikada bir likide edilen borç, 20:30–22:30 UTC",
    priceAxis: "ETH/USD",
    barsAxis: "2 dakikada likide edilen",
    table: { summary: "Veri tablosu", time: "Saat (UTC)", price: "ETH/USD", all: "Likide edilen, tüm teminatlar", weth: "Likide edilen, WETH teminatı" },
  },
  compare: {
    title: "Kaskad ve Aave",
    scenario: (v: { positions: S; debt: S; block: S; shock: S; low: S }) =>
      `Defter: ${v.positions} WETH teminatlı pozisyon, ${v.debt} borç, blok ${v.block}. Şok: ${v.low} değerine −${v.shock} (Chainlink dibi), oracle dış fiyatı izliyor, 100 blok.`,
    head: { metric: "", kaskad: "Kaskad (tahmin)", aave: "Aave (gerçekleşen)" },
    debt: "Likide edilen borç",
    positions: "Likide edilen pozisyon",
    headline: (v: { predicted: S; actual: S; diff: S }) =>
      `Kendini koruyan pozisyonlar hariç Kaskad ${v.predicted} tahmin etti; Aave'nin gerçekte likide ettiği ${v.actual}: ${v.diff}.`,
    whyTitle: "Nerede ayrışıyorlar, neden",
    matched: (v: { n: S; actual: S; predicted: S }) => `${v.n} pozisyon ikisinde de likide edildi: Aave'de ${v.actual}, Kaskad'da ${v.predicted}.`,
    defended: (v: { n: S; usd: S }) => `Kaskad'ın likide ettiği ${v.n} pozisyon, dipten önceki yarım saatte borç ödedi ya da teminat ekledi (${v.usd}). Kaskad kimsenin tepki vermediğini varsayıyor.`,
    unliquidated: (v: { n: S; usd: S }) => `${v.n} pozisyon dipte hâlâ batıktı ama likidatör gelmedi (${v.usd}).`,
    model: (v: { n: S; usd: S }) => `${v.n} pozisyonda model düpedüz yanıldı (${v.usd}).`,
    multiAsset: (v: { n: S; usd: S; other: S; assets: S; stables: boolean }) =>
      `Aave'nin likide edip Kaskad'ın etmediği ${v.n} pozisyon (${v.usd}): bunun ${v.other} kadarı WETH dışındaki teminatlara (${v.assets}${v.stables ? " ve stablecoin'ler" : ""}) karşı ödendi. Bu pozisyonlarda ETH ile birlikte düşen başka varlıklar da vardı; Kaskad ise bir seferde tek varlığı şoklar.`,
    outside: (v: { n: S; usd: S }) => `WETH teminatlı ${v.n} likidasyon (${v.usd}) bu defterin dışındaki pozisyonlardaydı: en büyük teminatları WETH değildi.`,
  },
  curve: {
    title: "Aynı defter, başka şoklar",
    lead: "Bu defter için Kaskad'ın farklı düşüşlerdeki tahmini. Vurgulu satır o gecenin düşüşü.",
    shock: "ETH düşüşü",
    debt: "Likide edilen borç",
    positions: "Pozisyon",
    thisNight: "o gece",
  },
  assumptions: {
    title: "Varsayımlar",
    scope: (v: { loops: S; loopsDebt: S }) =>
      `Defter: en büyük teminatı WETH olan borçlular. ${v.loops} ETH-üstüne-ETH döngüsü (${v.loopsDebt} borç) dışarıda: ETH hareketi böyle bir döngünün iki tarafını da değiştirir, Kaskad ise borcu dolar olarak sabit tutar. 100 doların altındaki toz pozisyonlar da dışarıda.`,
    depth: (v: { depth: S; same: S }) =>
      `Havuz derinliği ${v.depth}, o gecenin değil bugünün Ethereum ETH/stablecoin DEX derinliği. Bu büyüklükte sonucu neredeyse etkilemiyor: 20, 50 ve 100 blok aynı ${v.same} sonucunu veriyor.`,
    recovery: "Bloklar arası arbitraj toparlanması: %90, konsoldaki WETH (Ethereum) defteriyle aynı.",
    other: "Diğer teminatlar dolar değerinde sabit tutuluyor. Kaskad'ın kaçırdığı pozisyonların ana nedeni bu.",
    method: "Script'ler: scripts/src/replay (events, book, trough, compare). Motor: web/lib/chain/replay.ts, zincirdeki motorun birebir zincir dışı eşi.",
    bookBlock: "Defter bloğu Etherscan'de",
    lowBlock: "Chainlink dibi Etherscan'de",
  },
  cta: "Bugünkü defterleri konsolda sına",
} satisfies ReplayMessages;

export const replayMessages: Record<Locale, ReplayMessages> = { en, tr };
