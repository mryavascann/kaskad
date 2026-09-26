// Pure risk / gas math shared by the UI and scripts. All USD values are plain numbers.

export const MONAD_TX_GAS_LIMIT = 30_000_000;
export const MONAD_MEMORY_LIMIT = 8 * 1024 * 1024; // bytes per tx
/** Ethereum per-transaction gas cap since Fusaka (EIP-7825): 2^24. */
export const ETH_TX_GAS_CAP = 16_777_216;
export const ETH_COLD_SLOAD = 2_100;
export const MONAD_PAGE_SLOTS = 128;

const words = (bytes: number) => Math.ceil(bytes / 32);

/** Ethereum memory expansion cost for `bytes` of memory: 3w + w^2/512. */
export function ethMemoryGas(bytes: number): number {
  const w = words(bytes);
  return 3 * w + Math.floor((w * w) / 512);
}

/** Monad memory expansion cost: linear, w/2 (8 MB = 131,072 gas). */
export function monadMemoryGas(bytes: number): number {
  return Math.floor(words(bytes) / 2);
}

/** Aave health factor with one liquidation threshold applied to all collateral. */
export function healthFactor(collUsd: number, otherUsd: number, ltBps: number, debtUsd: number): number {
  if (debtUsd <= 0) return Infinity;
  return ((collUsd + otherUsd) * ltBps) / 10_000 / debtUsd;
}

/**
 * Fractional drop of the dominant collateral's price at which HF hits 1.
 * 0 or negative: already liquidatable. >= 1: never (other collateral alone covers it).
 */
export function depegToLiquidation(collUsd: number, otherUsd: number, ltBps: number, debtUsd: number): number {
  if (debtUsd <= 0) return Infinity;
  if (collUsd <= 0) return healthFactor(0, otherUsd, ltBps, debtUsd) >= 1 ? Infinity : 0;
  const needed = (debtUsd * 10_000) / ltBps - otherUsd; // collateral value needed at HF = 1
  return 1 - needed / collUsd;
}

/** Extra dominant collateral (USD at today's price) needed to keep HF >= target after a `shock` drop. */
export function collateralToSurvive(
  collUsd: number,
  otherUsd: number,
  ltBps: number,
  debtUsd: number,
  shock: number,
  target = 1.05,
): number {
  const neededAfter = (debtUsd * target * 10_000) / ltBps - otherUsd;
  const neededNow = neededAfter / (1 - shock);
  return Math.max(0, neededNow - collUsd);
}

/** Debt to repay (USD) to keep HF >= target after a `shock` drop. */
export function repayToSurvive(
  collUsd: number,
  otherUsd: number,
  ltBps: number,
  debtUsd: number,
  shock: number,
  target = 1.05,
): number {
  const maxDebt = ((collUsd * (1 - shock) + otherUsd) * ltBps) / 10_000 / target;
  return Math.max(0, debtUsd - maxDebt);
}

/** Gas limit for a real simulate() tx from the free preview's measured engine gas. */
export function simulateGasLimit(previewGas: bigint, rounds: number): bigint {
  // engine x1.15 + events (~4k each) + summary storage, calldata and intrinsic
  return (previewGas * 115n) / 100n + BigInt(rounds) * 4_000n + 250_000n;
}
