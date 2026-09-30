// Per-block cascade view. The math stays in lib/kaskad/timeline.ts; this adds the stall flag the
// legacy DominoCascade computed inline (components/visual/DominoCascade.tsx:19).

import { blockTimeline, type BlockPoint } from "@/lib/kaskad/timeline";
import type { Result, Scenario } from "./types";

export type { BlockPoint };

export type CascadeTimeline = {
  /** One point per block 0..steps (0 = before the shock); last point = final price. */
  points: BlockPoint[];
  activeBlocks: number;
  lastActiveStep: number;
  /**
   * Liquidations stopped before the last block while debt stayed stuck: no profitable sale left in
   * the pool (DominoCascade.tsx:19, note at :48-53).
   */
  stalled: boolean;
  stuckDebt: bigint;
};

export function cascadeTimeline(r: Result, s: Scenario): CascadeTimeline {
  const t = blockTimeline(r, s);
  return {
    ...t,
    stalled: t.lastActiveStep > 0 && t.lastActiveStep < s.steps && r.stuckDebt > 0n,
    stuckDebt: r.stuckDebt,
  };
}
