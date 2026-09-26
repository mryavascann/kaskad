"use client";

import { useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import type { Result, Scenario } from "@/app/_components/useKaskad";
import { fmtNum, fmtUsd, wadToNum } from "@/lib/kaskad/format";
import { blockTimeline } from "@/lib/kaskad/timeline";

/** One tile per block: lit when liquidations happened, dim when the cascade could not proceed. */
export function DominoCascade({ result, scenario }: { result: Result; scenario: Scenario }) {
  const reduced = useReducedMotion();
  const { points, activeBlocks, lastActiveStep } = blockTimeline(result, scenario);
  const prices = points.map((p) => p.price);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const line = prices
    .map((p, i) => `${(i / Math.max(1, prices.length - 1)) * 1000},${10 + ((high - p) / Math.max(1e-9, high - low)) * 70}`)
    .join(" ");
  const stalled = lastActiveStep > 0 && lastActiveStep < scenario.steps && result.stuckDebt > 0n;
  const blocks = points.slice(1);

  return (
    <div className="domino-cascade" aria-label={`${fmtNum(activeBlocks)} / ${fmtNum(scenario.steps)} blokta likidasyon`}>
      <div className="flex justify-between text-xs text-muted">
        <span>BLOK BLOK ETKİ</span>
        <span>
          {fmtNum(activeBlocks)} / {fmtNum(scenario.steps)} blokta likidasyon · {fmtNum(result.log.length)} dalga
        </span>
      </div>
      <svg className="domino-line" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={line} pathLength="1" style={{ animationDuration: `${Math.min(2400, 500 + blocks.length * 55)}ms` }} />
      </svg>
      <div className="domino-track">
        {blocks.map((b, i) => (
          <div
            key={b.step}
            className={`domino-tile ${b.liquidations ? "" : "idle"} ${reduced ? "still" : ""}`}
            style={{ "--delay": `${Math.min(i * 55, 1900)}ms` } as CSSProperties}
            title={`Blok ${b.step} · fiyat $${b.price.toFixed(4)} · ${
              b.liquidations ? `${fmtNum(b.liquidations)} likidasyon, ${fmtUsd(b.liquidated)}` : "likidasyon yok"
            }`}
          >
            <span>{b.step}</span>
            <span>{b.liquidations ? fmtNum(b.liquidations) : "·"}</span>
          </div>
        ))}
      </div>
      {stalled && (
        <div className="mt-2 text-xs text-warn">
          Likidasyonlar {fmtNum(lastActiveStep)}. blokta durdu: havuzda kârlı satış kalmadı. Fiyat düşmeye devam etti,{" "}
          {fmtUsd(wadToNum(result.stuckDebt))} borç eşiğin altında bekliyor.
        </div>
      )}
    </div>
  );
}
