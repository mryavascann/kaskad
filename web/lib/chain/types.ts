// Chain-facing types for the new UI. Pure type module: no runtime code, safe to import anywhere.
// Scenario / RoundLog / Result moved from app/_components/useKaskad.ts:9-43 (unchanged shapes).

/** Engine scenario tuple, identical to Kaskad.Scenario (contracts/src/Kaskad.sol:25-32). */
export type Scenario = {
  /** Book id: Aave reserve index, OR'ed with CALIBRATED (256) for the calibrated book. */
  assetId: number;
  /** Final depeg in bps: 300 = -3 %. */
  shockBps: number;
  /** Blocks in the straight-line price path. */
  steps: number;
  /** Liquidation waves per block. */
  maxRoundsPerStep: number;
  /** Resolution: the first N positions of the book. */
  maxPositions: number;
  /** 0: the oracle sees only the external path; 10000: the oracle follows the pool price. */
  oracleFeedbackBps: number;
};

/** One liquidation wave (Kaskad.sol:34-42). USD amounts are WAD (1e18) bigints. */
export type RoundLog = {
  step: number;
  round: number;
  liquidations: number;
  priceWad: bigint;
  liquidatedDebt: bigint;
  seized: bigint;
  deficit: bigint;
};

/** `preview` / `simulate` result (Kaskad.sol:44-59). USD amounts and prices are WAD bigints. */
export type Result = {
  totalDebt: bigint;
  totalCollateral: bigint;
  totalLiquidated: bigint;
  totalSeized: bigint;
  /** Sum of max(0, debt - collateral value) at the end: the shortfall depositors eat. */
  badDebt: bigint;
  /** Debt still under HF 1 at the end without a shortfall: an instant-sale liquidator could not profit. */
  stuckDebt: bigint;
  startPrice: bigint;
  finalPrice: bigint;
  rounds: number;
  liquidations: number;
  positionsUsed: number;
  gasUsed: bigint;
  memoryBytes: bigint;
  log: readonly RoundLog[];
};

/** `previewCurve` (Kaskad.sol:165-183): bad debt and liquidated debt per shock level (WAD). */
export type CurveResult = {
  bad: readonly bigint[];
  liq: readonly bigint[];
  gasUsed: bigint;
  memoryBytes: bigint;
};

/** `previewMC` result (app/_components/MonteCarlo.tsx:18-32, KaskadMC.sol:24-38). */
export type MonteCarloResult = {
  paths: bigint;
  positionsUsed: bigint;
  totalDebt: bigint;
  meanBadDebt: bigint;
  p95BadDebt: bigint;
  worstBadDebt: bigint;
  lossPaths: bigint;
  meanShockBps: bigint;
  worstShockBps: bigint;
  gasUsed: bigint;
  memoryBytes: bigint;
  badDebt: readonly bigint[];
  shockBps: readonly bigint[];
};

/** Demo lending market state (app/_components/GuardPanel.tsx:16). */
export type MarketState = { paused: boolean; maxLtvBps: number; borrowed: bigint };

/** Scenario settings as the UI edits them (app/_components/Protocol.tsx:33-41). */
export type Settings = {
  assetId: number;
  shockPct: number;
  steps: number;
  rounds: number;
  /** oracleFeedbackBps: 0 (external price) or 10000 (pool price, worst case). */
  feedback: number;
  calibrated: boolean;
  resolution: number;
};

/** Oracle model of a run: `external` = feedback 0 (Aave's model), `pool` = feedback > 0 (worst case). */
export type OracleMode = "external" | "pool";

/** Chain the position book was read from (all books are simulated on Monad testnet). */
export type BookChain = "monad" | "ethereum";

/** Which book a run uses: the real Aave positions or the calibrated (synthetic) sample. */
export type BookKind = "real" | "calibrated";
