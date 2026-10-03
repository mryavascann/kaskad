// The 10 October 2025 replay (B7): Kaskad's engine on the real Aave V3 Ethereum WETH book of that
// night, against every liquidation Aave executed. Built by scripts/src/replay (npm run replay:*),
// copied here as JSON (a test keeps it equal to scripts/data/oct10-replay.json). Static: no RPC.

import data from "./oct10-replay.json";

export type Oct10Replay = typeof data;
export const OCT10: Oct10Replay = data;

export const ETHERSCAN = "https://etherscan.io";
export const blockUrl = (n: number) => `${ETHERSCAN}/block/${n}`;

/**
 * The comparison's headline: the positions that did not defend themselves (no repay, no collateral
 * added before the low), predicted against what Aave actually liquidated in the book. `diff` is
 * (predicted - actual) / actual.
 */
export function undefended(r: Oct10Replay = OCT10): { predictedUsd: number; actualUsd: number; diff: number } {
  const why = r.match.why;
  const predictedUsd = r.match.both.predictedUsd + why.onlyPredicted.unliquidated.predictedUsd + why.onlyPredicted.model.predictedUsd;
  const actualUsd = r.actual.liquidatedUsdInBook;
  return { predictedUsd, actualUsd, diff: (predictedUsd - actualUsd) / actualUsd };
}

/** Of the positions Aave liquidated and Kaskad did not: debt repaid against collateral other than the shocked asset. */
export function otherCollateralUsd(r: Oct10Replay = OCT10): number {
  const seized = r.match.why.onlyActualSeized as Record<string, number>;
  return Object.entries(seized).reduce((s, [asset, usd]) => (asset === r.book.asset ? s : s + usd), 0);
}

/** Dollar stablecoins: collateral that does not fall with ETH (named apart in the copy). */
const STABLES = new Set(["USDT", "USDC", "DAI", "GHO", "USDe", "sUSDe", "USDS", "sUSDS", "PYUSD", "RLUSD", "USDtb", "FRAX", "LUSD", "crvUSD"]);
export const isStable = (symbol: string) => STABLES.has(symbol);
