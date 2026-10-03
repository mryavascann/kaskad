/**
 * B7 replay, step 3: what Kaskad would have predicted for the 10 October 2025 crash, against what
 * Aave V3 Ethereum actually liquidated.
 *
 * Inputs (from oct10-events.ts and fetch-eth-syrup.ts --block 23549825 --out oct10-weth):
 *   data/oct10-weth.json          WETH-backed book at the last block before ETH/USD started falling
 *   data/oct10-ethusd.json        Chainlink ETH/USD path (the price AaveOracle used for WETH)
 *   data/oct10-liquidations.json  every LiquidationCall in the window, priced at its own block
 *   data/oct10-trough.json        every book position's real state at the Chainlink low (optional)
 *
 * The cascade runs on web/lib/chain/replay.ts, the exact off-chain mirror of the on-chain engine.
 * Scenario: the measured drawdown (book price -> Chainlink low), external oracle (Chainlink follows
 * CEX prices, not the on-chain pool), 100 blocks (the engine's maximum; the real fall took ~150).
 *
 * Writes data/oct10-replay.json (consumed by the web replay screen) and prints the comparison.
 * Usage: npx tsx src/replay/oct10-compare.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getAddress } from "viem";
import { DATA_DIR } from "../lib/env.js";
import { realToPacked, type RealPosition } from "../../../web/lib/kaskad/calibrate.js";
import { packPosition } from "../../../web/lib/kaskad/pack.js";
import { replay, type ReplayScenario } from "../../../web/lib/chain/replay.js";

const WAD = 10n ** 18n;
/** Arbitrage recovery between blocks KaskadMC uses for the WETH (Ethereum) book (asset 7). */
const RECOVERY_BPS = 9_000;
/** The crash itself: 20:51-21:35 UTC holds 99% of the WETH-collateral liquidations of the night. */
const CRASH_TO_BLOCK = 23_550_050;

type Book = { block: number; totals: { selfDebtExcluded: { positions: number; debtUsd: number } | null; dustDropped: { positions: number; debtUsd: number } | null }; reserves: { priceUsd8: string }[]; depth: { depthUsd: number; source: string; note: string }; positions: (RealPosition & { hfOnchain: number | null })[] };
type Liq = { block: number; time: string; tx: string; user: string; collateral: string; collateralAsset: string; debt: string; debtUsd: number; collateralUsd: number };

const read = <T>(f: string) => JSON.parse(readFileSync(path.join(DATA_DIR, f), "utf8")) as T;
const book = read<Book>("oct10-weth.json");
const price = read<{
  bookPriceUsd: number;
  low: { block: number; time: string; priceUsd: number };
  drawdownBps: number;
  pinned: { symbol: string; description: string; bookPriceUsd: number; lowPriceUsd: number }[];
  updates: { block: number; time: string; priceUsd: number }[];
}>("oct10-ethusd.json");
const liqs = read<{ liquidations: Liq[] }>("oct10-liquidations.json").liquidations;

const usd = (wad: bigint) => Number(wad / 10n ** 12n) / 1e6;
const fmt = (x: number) => `$${(x / 1e6).toFixed(2)}M`;

// ---------------------------------------------------------------------------------------------
// The book as the engine would read it.

const positions = book.positions;
const slots = positions.map((p) => packPosition(realToPacked(p)));
const bookDebt1e6 = positions.reduce((s, p) => s + realToPacked(p).debt, 0n);
const priceWad = (BigInt(book.reserves[0].priceUsd8) * WAD) / 10n ** 8n;
const depthUsdWad = BigInt(Math.round(book.depth.depthUsd)) * WAD;
const replayBook = { priceWad, depthUsdWad, bookDebt1e6, recoveryBps: RECOVERY_BPS, slots };

function run(shockBps: number, steps = 100) {
  const s: ReplayScenario = { shockBps, steps, maxRoundsPerStep: 3, maxPositions: slots.length, oracleFeedbackBps: 0 };
  return replay(replayBook, s);
}

// ---------------------------------------------------------------------------------------------
// What actually happened, for the users in the book.

const inBook = new Map<string, number>(positions.map((p, i) => [getAddress(p.user), i]));
const crash = liqs.filter((l) => l.block <= CRASH_TO_BLOCK);
const actualByUser = new Map<string, { debtUsd: number; count: number; collateral: Set<string> }>();
for (const l of liqs) {
  const u = getAddress(l.user);
  if (!inBook.has(u)) continue;
  const a = actualByUser.get(u) ?? { debtUsd: 0, count: 0, collateral: new Set() };
  a.debtUsd += l.debtUsd;
  a.count++;
  a.collateral.add(l.collateral);
  actualByUser.set(u, a);
}
const wethLiqs = liqs.filter((l) => l.collateral === "WETH");
const wethOutside = wethLiqs.filter((l) => !inBook.has(getAddress(l.user)));
const actualInBook = [...actualByUser.values()].reduce((s, a) => s + a.debtUsd, 0);

// ---------------------------------------------------------------------------------------------
// The replay and the comparison.

const main = run(price.drawdownBps);
const predicted = new Map<string, { repaid: number; end: string }>();
main.positions.forEach((t, i) => {
  if (t.repaid > 0n) predicted.set(getAddress(positions[i].user), { repaid: usd(t.repaid), end: t.end });
});

const both = [...predicted.keys()].filter((u) => actualByUser.has(u));
const onlyPredicted = [...predicted.keys()].filter((u) => !actualByUser.has(u));
const onlyActual = [...actualByUser.keys()].filter((u) => !predicted.has(u));
const sumActual = (us: string[]) => us.reduce((s, u) => s + actualByUser.get(u)!.debtUsd, 0);
const sumPred = (us: string[]) => us.reduce((s, u) => s + predicted.get(u)!.repaid, 0);

// Why each missed position was missed: its HF at the trough with the model vs on chain.
const missed = onlyActual.map((u) => {
  const p = positions[inBook.get(u)!];
  const t = main.positions[inBook.get(u)!];
  const liqPrice = Number(t.liqPrice0 / 10n ** 10n) / 1e8;
  return { user: u, debtUsd: p.debtUsd, actualRepaidUsd: actualByUser.get(u)!.debtUsd, hfOnchain: p.hfOnchain, hfModel: p.hfModel, modelLiqPriceUsd: liqPrice, otherCollateralUsd: p.otherCollateralUsd };
});

// Why the misses happened, from the positions' real state at the Chainlink low (oct10-trough.ts).
type Trough = Record<string, { hf: number | null; collateralUsd: number; debtUsd: number }>;
const trough = existsSync(path.join(DATA_DIR, "oct10-trough.json")) ? read<{ users: Trough }>("oct10-trough.json").users : null;
const lowRatio = price.low.priceUsd / price.bookPriceUsd;
type PredictedWhy = "defended" | "unliquidated" | "model";
const predictedWhy = (u: string): PredictedWhy => {
  const t = trough![u];
  const p = positions[inBook.get(u)!];
  if (t.hf === null) return "defended"; // debt repaid to zero before the low
  if (t.hf < 1) return "unliquidated"; // under water at the low, no liquidation that night
  const expectedColl = p.collateralUsd * lowRatio + p.otherCollateralUsd;
  if (t.debtUsd < p.debtUsd * 0.97 || t.collateralUsd > expectedColl * 1.03) return "defended"; // repaid or added collateral
  return "model";
};
const why = trough
  ? (() => {
      const groups: Record<PredictedWhy, string[]> = { defended: [], unliquidated: [], model: [] };
      for (const u of onlyPredicted) groups[predictedWhy(u)].push(u);
      const seized = new Map<string, number>();
      for (const l of liqs) if (onlyActual.includes(getAddress(l.user))) seized.set(l.collateral, (seized.get(l.collateral) ?? 0) + l.debtUsd);
      return {
        onlyPredicted: Object.fromEntries(
          Object.entries(groups).map(([k, us]) => [k, { positions: us.length, predictedUsd: Math.round(sumPred(us)) }]),
        ) as Record<PredictedWhy, { positions: number; predictedUsd: number }>,
        onlyActualSeized: Object.fromEntries([...seized].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, Math.round(v)])),
      };
    })()
  : null;

const curve = [500, 800, 1_000, 1_200, price.drawdownBps, 1_600, 2_000].map((bps) => {
  const r = run(bps);
  return { shockBps: bps, liquidatedUsd: usd(r.totalLiquidated), liquidations: r.liquidations, positions: r.positions.filter((t) => t.repaid > 0n).length, badDebtUsd: usd(r.badDebt), stuckDebtUsd: usd(r.stuckDebt) };
});
const stepsSensitivity = [20, 50, 100].map((steps) => ({ steps, liquidatedUsd: usd(run(price.drawdownBps, steps).totalLiquidated) }));

// The night on one axis: Chainlink ETH/USD and liquidated debt per 2 minutes, 20:30-22:30 UTC.
const T0 = Date.parse("2025-10-10T20:30:00Z");
const T1 = Date.parse("2025-10-10T22:30:00Z");
const BIN = 2 * 60_000;
const bins = Array.from({ length: (T1 - T0) / BIN }, (_, i) => ({ t: new Date(T0 + i * BIN).toISOString(), allUsd: 0, wethUsd: 0 }));
for (const l of liqs) {
  const i = Math.floor((Date.parse(l.time) - T0) / BIN);
  if (i < 0 || i >= bins.length) continue;
  bins[i].allUsd += l.debtUsd;
  if (l.collateral === "WETH") bins[i].wethUsd += l.debtUsd;
}
const before = price.updates.filter((u) => Date.parse(u.time) < T0).at(-1);
const timeline = {
  from: new Date(T0).toISOString(),
  to: new Date(T1).toISOString(),
  price: [...(before ? [{ ...before, time: new Date(T0).toISOString() }] : []), ...price.updates.filter((u) => Date.parse(u.time) >= T0 && Date.parse(u.time) < T1)].map((u) => ({ t: u.time, usd: u.priceUsd })),
  liquidations: bins.map((b) => ({ t: b.t, allUsd: Math.round(b.allUsd), wethUsd: Math.round(b.wethUsd) })),
};

const out = {
  generatedAt: new Date().toISOString(),
  event: "Aave V3 Ethereum, 10-11 October 2025",
  book: {
    block: book.block,
    asset: "WETH",
    positions: positions.length,
    debtUsd: Math.round(usd(main.totalDebt)),
    priceUsd: price.bookPriceUsd,
    scope: "Borrowers whose dominant collateral is WETH; ETH-correlated debt loops and dust < $100 excluded (fetch-eth-syrup.ts).",
    excludedLoops: book.totals.selfDebtExcluded,
    excludedDust: book.totals.dustDropped,
  },
  scenario: {
    shockBps: price.drawdownBps,
    lowUsd: price.low.priceUsd,
    lowAt: price.low.time,
    lowBlock: price.low.block,
    steps: 100,
    rounds: 3,
    oracle: "external (Chainlink ETH/USD follows CEX prices, not the on-chain pool)",
    depthUsd: Math.round(book.depth.depthUsd),
    depthIsAssumption: true,
    depthNote: "Ethereum ETH/stable DEX depth measured at fetch time (2026), not on 10 October 2025.",
    recoveryBps: RECOVERY_BPS,
  },
  predicted: {
    liquidatedUsd: Math.round(usd(main.totalLiquidated)),
    positions: predicted.size,
    liquidations: main.liquidations,
    badDebtUsd: Math.round(usd(main.badDebt)),
    stuckDebtUsd: Math.round(usd(main.stuckDebt)),
    hiddenBadDebtUsd: Math.round(usd(main.hiddenBadDebt)),
    finalPoolPriceUsd: usd(main.spotPrice),
  },
  actual: {
    liquidatedUsdInBook: Math.round(actualInBook),
    positionsInBook: actualByUser.size,
    crashWindowTo: CRASH_TO_BLOCK,
    allAave: { liquidations: liqs.length, debtUsd: Math.round(liqs.reduce((s, l) => s + l.debtUsd, 0)) },
    allWethCollateral: { liquidations: wethLiqs.length, debtUsd: Math.round(wethLiqs.reduce((s, l) => s + l.debtUsd, 0)) },
    wethCollateralOutsideBook: { liquidations: wethOutside.length, users: new Set(wethOutside.map((l) => l.user)).size, debtUsd: Math.round(wethOutside.reduce((s, l) => s + l.debtUsd, 0)) },
    crashShareOfWeth: wethLiqs.length ? crash.filter((l) => l.collateral === "WETH").reduce((s, l) => s + l.debtUsd, 0) / wethLiqs.reduce((s, l) => s + l.debtUsd, 0) : 0,
    pinned: price.pinned,
    usde: { liquidations: liqs.filter((l) => l.collateral === "USDe" || l.collateral === "sUSDe").length, debtUsd: Math.round(liqs.filter((l) => l.collateral === "USDe" || l.collateral === "sUSDe").reduce((s, l) => s + l.debtUsd, 0)) },
  },
  match: {
    both: { positions: both.length, actualUsd: Math.round(sumActual(both)), predictedUsd: Math.round(sumPred(both)) },
    onlyPredicted: { positions: onlyPredicted.length, predictedUsd: Math.round(sumPred(onlyPredicted)) },
    onlyActual: { positions: onlyActual.length, actualUsd: Math.round(sumActual(onlyActual)) },
    missed: missed.sort((a, b) => b.actualRepaidUsd - a.actualRepaidUsd).slice(0, 20),
    why,
  },
  curve,
  stepsSensitivity,
  timeline,
};
writeFileSync(path.join(DATA_DIR, "oct10-replay.json"), JSON.stringify(out, null, 1));

console.log(`book: block ${book.block}, ${positions.length} WETH-backed positions, debt ${fmt(usd(main.totalDebt))}, ETH $${price.bookPriceUsd}`);
console.log(`scenario: -${price.drawdownBps / 100}% to $${price.low.priceUsd} (${price.low.time}), 100 blocks, external oracle, depth ${fmt(book.depth.depthUsd)} (assumption)`);
console.log(`predicted: ${fmt(out.predicted.liquidatedUsd)} repaid over ${predicted.size} positions (${main.liquidations} liquidations), bad ${fmt(out.predicted.badDebtUsd)}, stuck ${fmt(out.predicted.stuckDebtUsd)}, hidden ${fmt(out.predicted.hiddenBadDebtUsd)}`);
console.log(`actual (book users): ${fmt(actualInBook)} repaid over ${actualByUser.size} positions`);
console.log(`  both ${both.length} (actual ${fmt(sumActual(both))} / predicted ${fmt(sumPred(both))}) | only predicted ${onlyPredicted.length} (${fmt(sumPred(onlyPredicted))}) | only actual ${onlyActual.length} (${fmt(sumActual(onlyActual))})`);
console.log(`all Aave: ${liqs.length} liquidations ${fmt(out.actual.allAave.debtUsd)}; WETH collateral ${wethLiqs.length} ${fmt(out.actual.allWethCollateral.debtUsd)}, of which outside the book ${wethOutside.length} (${fmt(out.actual.wethCollateralOutsideBook.debtUsd)})`);
if (why) {
  console.log("only predicted, why:", Object.entries(why.onlyPredicted).map(([k, v]) => `${k} ${v.positions} (${fmt(v.predictedUsd)})`).join(" | "));
  console.log("only actual, collateral seized:", Object.entries(why.onlyActualSeized).map(([k, v]) => `${k} ${fmt(v)}`).join(" | "));
}
console.log("curve:", curve.map((c) => `-${c.shockBps / 100}% ${fmt(c.liquidatedUsd)}/${c.positions}`).join(" | "));
console.log("steps:", stepsSensitivity.map((s) => `${s.steps}: ${fmt(s.liquidatedUsd)}`).join(" | "));
console.log("top missed:", missed.slice(0, 8).map((m) => `${m.user.slice(0, 8)} debt ${fmt(m.debtUsd)} repaid ${fmt(m.actualRepaidUsd)} hfOn ${m.hfOnchain?.toFixed(3)} hfModel ${m.hfModel?.toFixed(3)} liqPx $${m.modelLiqPriceUsd.toFixed(0)}`).join("\n  "));
