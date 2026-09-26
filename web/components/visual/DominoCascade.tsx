"use client";

import { useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import type { Result } from "@/app/_components/useKaskad";
import { fmtNum, fmtUsd, wadToNum } from "@/lib/kaskad/format";

export function DominoCascade({ result }: { result: Result }) {
  const reduced = useReducedMotion();
  const prices = [wadToNum(result.startPrice), ...result.log.map(l => wadToNum(l.priceWad))];
  const high = Math.max(...prices), low = Math.min(...prices);
  const points = prices.map((p, i) => `${i / Math.max(1, prices.length - 1) * 1000},${10 + (high - p) / Math.max(.001, high - low) * 70}`).join(" ");
  return <div className="domino-cascade" aria-label={`${fmtNum(result.log.length)} likidasyon dalgası`}>
    <div className="flex justify-between text-xs text-muted"><span>DALGA DALGA ETKİ</span><span>{fmtNum(result.log.length)} dalga</span></div>
    <svg className="domino-line" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} pathLength="1" style={{ animationDuration: `${Math.min(2400, 500 + result.log.length * 55)}ms` }} /></svg>
    <div className="domino-track">{result.log.map((wave, i) => <div key={`${wave.step}-${wave.round}`} className={`domino-tile ${reduced ? "still" : ""}`} style={{ "--delay": `${Math.min(i * 55, 1900)}ms` } as CSSProperties} title={`Blok ${wave.step} · Dalga ${wave.round + 1} · ${fmtUsd(wadToNum(wave.liquidatedDebt))}`}><span>{i + 1}</span><span>{fmtNum(wave.liquidations)}</span></div>)}</div>
  </div>;
}
