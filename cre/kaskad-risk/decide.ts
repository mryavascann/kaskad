// The workflow's decision, with no CRE or chain access: what the reads say -> what to send.
// Mirrors RiskOracle.publish() (contracts/src/RiskOracle.sol), GuardV2.refresh() and
// RiskVault.rebalance() so a report is sent only when it changes something.

export const BPS = 10_000n;

/** Why a report is sent; stored on chain as KaskadCREReceiver.Instruction.reason. */
export const REASON = {
  none: 0,
  /** An asset has never been published. */
  first: 1,
  /** The trigger-shock preview disagrees with the stored verdict. */
  flip: 2,
  /** The stored report is older than the workflow's refresh age. */
  stale: 3,
  /** Kaskad emitted AssetSet / PositionsLoaded / BookReset for the asset (log trigger). */
  bookChanged: 4,
  /** No publish needed, but GuardV2 or RiskVault lag the oracle's current state. */
  sync: 5,
} as const;
export type Reason = (typeof REASON)[keyof typeof REASON];

export type Rule = {
  enabled: boolean;
  triggerShockBps: number;
  lossThresholdBps: number;
  stuckThresholdBps: number;
  minInterval: number;
};

export type State = { atRisk: boolean; recommendedLtvBps: number; lastPublished: number };

/** The trigger-shock preview (KaskadMCv3.previewWithHidden), USD WAD. */
export type Preview = { totalDebt: bigint; badDebt: bigint; stuckDebt: bigint; hiddenBadDebt: bigint };

export type AssetView = { assetId: number; rule: Rule; state: State; preview: Preview };

export type MarketView = {
  address: string;
  assetId: number;
  paused: boolean;
  /** GuardV2.lastAtRisk(market), unix seconds. */
  lastAtRisk: number;
  /** RiskVault.flagged(market). */
  flagged: boolean;
  /** RiskVault's deposit in the market. */
  vaultDeposit: bigint;
};

export type Verdict = { atRisk: boolean; lossBps: number; stuckBps: number };

/** RiskOracle.publish()'s decision on a report (RiskOracle.sol: lossBps, stuckBps, atRisk). */
export function verdict(p: Preview, rule: Pick<Rule, "lossThresholdBps" | "stuckThresholdBps">): Verdict {
  const cap = (x: bigint) => (x > BPS ? BPS : x);
  const lossBps = p.totalDebt === 0n ? 0 : Number(cap(((p.badDebt + p.hiddenBadDebt) * BPS) / p.totalDebt));
  const stuckBps = p.totalDebt === 0n ? 0 : Number(cap((p.stuckDebt * BPS) / p.totalDebt));
  const atRisk = lossBps > rule.lossThresholdBps || (rule.stuckThresholdBps !== 0 && stuckBps > rule.stuckThresholdBps);
  return { atRisk, lossBps, stuckBps };
}

export type AssetDecision = {
  assetId: number;
  publish: boolean;
  /** Why it is published, or why not ("cooldown" / "steady" / "disabled"). */
  why: Reason | "cooldown" | "steady" | "disabled";
  predicted: Verdict;
  /** Seconds until publish() is allowed again (0: now). */
  cooldownLeft: number;
};

/**
 * Publish when the asset was never published, when the preview flips the stored verdict, when the
 * report is older than `refreshAfter`, or when the book changed (log trigger). Never inside the
 * oracle's cooldown: publish() would revert TooSoon.
 */
export function decideAsset(a: AssetView, nowSec: number, refreshAfter: number, bookChanged: boolean): AssetDecision {
  const predicted = verdict(a.preview, a.rule);
  const base = { assetId: a.assetId, predicted };
  if (!a.rule.enabled) return { ...base, publish: false, why: "disabled", cooldownLeft: 0 };
  const last = a.state.lastPublished;
  const cooldownLeft = last === 0 ? 0 : Math.max(0, last + a.rule.minInterval - nowSec);

  let why: Reason | "steady" = "steady";
  if (last === 0) why = REASON.first;
  else if (bookChanged) why = REASON.bookChanged;
  else if (predicted.atRisk !== a.state.atRisk) why = REASON.flip;
  else if (nowSec - last >= refreshAfter) why = REASON.stale;

  if (why === "steady") return { ...base, publish: false, why, cooldownLeft };
  if (cooldownLeft > 0) return { ...base, publish: false, why: "cooldown", cooldownLeft };
  return { ...base, publish: true, why, cooldownLeft };
}

/**
 * GuardV2.refresh() would change a market: at risk but open, or clear, paused and past the recovery
 * delay (GuardV2.sol). `atRisk` is the oracle's state once this report's publishes land.
 */
export function guardLags(m: MarketView, atRisk: boolean, nowSec: number, recoveryDelay: number): boolean {
  if (atRisk) return !m.paused;
  return m.paused && nowSec >= m.lastAtRisk + recoveryDelay;
}

/** RiskVault.rebalance() would move funds: money in a flagged market, or idle money and an open one. */
export function vaultLags(markets: readonly MarketView[], idle: bigint): boolean {
  return markets.some((m) => (m.flagged && m.vaultDeposit > 0n) || (!m.flagged && idle > 0n));
}

export type Plan = {
  publish: number[];
  refreshGuard: boolean;
  rebalanceVault: boolean;
  reason: Reason;
  assets: AssetDecision[];
};

export type PlanInput = {
  assets: readonly AssetView[];
  markets: readonly MarketView[];
  vaultIdle: bigint;
  recoveryDelay: number;
  nowSec: number;
  refreshAfter: number;
  /** Assets whose book or price changed (log trigger). */
  changed?: ReadonlySet<number>;
};

/** The whole decision. `reason` is that of the first asset published, else `sync`, else `none`. */
export function plan(input: PlanInput): Plan {
  const assets = input.assets.map((a) => decideAsset(a, input.nowSec, input.refreshAfter, input.changed?.has(a.assetId) ?? false));
  const publish = assets.filter((d) => d.publish).map((d) => d.assetId);

  // The oracle's verdict once this report lands: predicted for what is published, stored otherwise.
  const after = new Map<number, boolean>();
  for (const a of input.assets) after.set(a.assetId, a.state.atRisk);
  for (const d of assets) if (d.publish) after.set(d.assetId, d.predicted.atRisk);

  const refreshGuard = publish.length > 0 || input.markets.some((m) => guardLags(m, after.get(m.assetId) ?? false, input.nowSec, input.recoveryDelay));
  const rebalanceVault = publish.length > 0 || vaultLags(input.markets, input.vaultIdle);

  const first = assets.find((d) => d.publish);
  const reason: Reason = first ? (first.why as Reason) : refreshGuard || rebalanceVault ? REASON.sync : REASON.none;
  return { publish, refreshGuard, rebalanceVault, reason, assets };
}

/** writeReport gas limit: Monad charges the limit, so it is sized to what the report runs. */
export function reportGasLimit(p: Pick<Plan, "publish" | "refreshGuard" | "rebalanceVault">, g: { base: bigint; perPublish: bigint; guard: bigint; vault: bigint }): bigint {
  return g.base + BigInt(p.publish.length) * g.perPublish + (p.refreshGuard ? g.guard : 0n) + (p.rebalanceVault ? g.vault : 0n);
}
