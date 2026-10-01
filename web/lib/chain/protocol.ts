// Liquidation rules of the engine, mirrored for copy and charts. Source: contracts/src/Kaskad.sol
// (constants at :15-16, `_liquidate` at :408-440). protocol.test.ts re-reads the Solidity source and
// fails if these drift.

/** Share of the debt a liquidation repays: `repay = full ? d : d / 2`. */
export const CLOSE_FACTOR = 0.5;

/** Below this health factor the whole debt can be repaid (`CLOSE_FACTOR_HF_THRESHOLD = 0.95e18`). */
export const FULL_CLOSE_HF = 0.95;

/** Debt or collateral worth less than this (USD) is closed in full (`MIN_BASE_MAX_CLOSE_FACTOR = 2000e18`). */
export const FULL_CLOSE_MIN_USD = 2_000;
