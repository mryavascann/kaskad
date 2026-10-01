// "What happened?" as typed facts instead of Turkish prose. Branch logic copied from
// narrate() in app/_components/Protocol.tsx:117-143; pages turn the facts into EN / TR copy.

import type { AssetInfo } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import { symbol } from "./scenario";
import type { Result, Settings } from "./types";

/**
 * Recovery (bps of the pool's displacement arbitrage closes per block) from which the external-
 * oracle story says arbitrage keeps the pool usable (Protocol.tsx:131).
 */
export const ARBITRAGE_RECOVERS_BPS = 5_000;

/** How the oracle behaved (Protocol.tsx:127-134). */
export type OracleStory =
  /** feedback > 0: sales move the oracle, which triggers new liquidations. */
  | { kind: "spiral"; startPrice: number; finalPrice: number; drop: number }
  /** feedback 0: sales do not move the oracle; the pool's refill decides whether sales continue. */
  | { kind: "external"; arbitrage: "recovers" | "thin"; recoveryBps: number };

export type NarrativeFacts =
  /** No position reached its liquidation threshold: no losses (Protocol.tsx:124-125). */
  | { kind: "no-liquidations"; symbol: string; steps: number; shockPct: number }
  | {
      kind: "cascade";
      symbol: string;
      steps: number;
      shockPct: number;
      liquidations: number;
      /** Pool the seized collateral is sold into (deployment depth, see AssetInfo.depthIsAssumption). */
      depthUsd: number;
      oracle: OracleStory;
      /** Bad debt clause (Protocol.tsx:135-140); `badDebtUsd` 0 means "no bad debt". Scaled. */
      outcome: { badDebtUsd: number; totalDebtUsd: number };
      /** Stuck-debt clause, only when > 0 (Protocol.tsx:141). Scaled. */
      stuck: { stuckDebtUsd: number } | null;
    };

/** narrate(r, asset, settings, scale) as data (Protocol.tsx:118-143). `scale` from calibratedScale(). */
export function narrativeFacts(r: Result, a: AssetInfo, s: Settings, scale: number): NarrativeFacts {
  const rec = RECOVERY_BPS[a.id]?.bps ?? 0;
  const name = symbol(a);
  if (r.liquidations === 0) return { kind: "no-liquidations", symbol: name, steps: s.steps, shockPct: s.shockPct };
  const p0 = wadToNum(r.startPrice);
  const pf = wadToNum(r.finalPrice);
  const oracle: OracleStory =
    s.feedback > 0
      ? { kind: "spiral", startPrice: p0, finalPrice: pf, drop: 1 - pf / p0 }
      : { kind: "external", arbitrage: rec >= ARBITRAGE_RECOVERS_BPS ? "recovers" : "thin", recoveryBps: rec };
  const bad = wadToNum(r.badDebt) * scale;
  const stuck = wadToNum(r.stuckDebt) * scale;
  return {
    kind: "cascade",
    symbol: name,
    steps: s.steps,
    shockPct: s.shockPct,
    liquidations: r.liquidations,
    depthUsd: a.depthUsd,
    oracle,
    outcome: { badDebtUsd: bad, totalDebtUsd: wadToNum(r.totalDebt) * scale },
    stuck: stuck > 0 ? { stuckDebtUsd: stuck } : null,
  };
}
