/**
 * External public facts the landing quotes. Every other number on the page comes from the chain,
 * deployment.json or lib/chain constants; these are the only ones that don't, so each has a source.
 */

/**
 * What Aave paid Gauntlet, its off-chain risk manager, per year (USD). Source: CoinDesk, 2024-02-27,
 * "Days after ditching Aave, risk manager Gauntlet moves to rival lender Morpho"
 * (https://www.coindesk.com/tech/2024/02/27/days-after-ditching-aave-risk-manager-gauntlet-moves-to-rival-lender-morpho),
 * also cited in the repository README.
 */
export const GAUNTLET_AAVE_FEE_USD_PER_YEAR = 1_600_000;
export const GAUNTLET_FEE_SOURCE_URL =
  "https://www.coindesk.com/tech/2024/02/27/days-after-ditching-aave-risk-manager-gauntlet-moves-to-rival-lender-morpho";

/**
 * Monad block time and finality (ms). Source: Monad documentation (docs.monad.xyz, "Monad
 * architecture": 300 ms blocks, finality two blocks later). Checked against Monad testnet on
 * 2026-09-30 with two eth_blockNumber reads 10 s apart: 33 blocks, ~0.31 s per block. The landing also
 * shows the live observed rate next to it (BlockPulse).
 */
export const MONAD_BLOCK_TIME_MS = 300;
export const MONAD_FINALITY_MS = 600;
