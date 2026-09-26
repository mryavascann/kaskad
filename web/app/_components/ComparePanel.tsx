"use client";

import { useEffect, useState } from "react";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { fmtNum, fmtUsd, wadToNum } from "@/lib/kaskad/format";
import { previewScenario, type Result } from "./useKaskad";

// Same shock, books from two chains: all simulated by the same engine on Monad.
const ROWS: { id: number; chain: "Monad" | "Ethereum"; note?: string }[] = [
  { id: 9, chain: "Monad" },
  { id: 15, chain: "Ethereum", note: "aynı Maple döngüsü" },
  { id: 2, chain: "Monad" },
  { id: 14, chain: "Ethereum", note: "aynı varlık, derin havuz" },
  { id: 13, chain: "Ethereum", note: "derin likidite referansı" },
  { id: 5, chain: "Monad", note: "ETH yatır, stablecoin borç al" },
  { id: 7, chain: "Ethereum", note: "aynı klasik pozisyon" },
];

export function ComparePanel({ shockBps, feedback, steps, rounds }: {
  shockBps: number;
  feedback: number;
  steps: number;
  rounds: number;
}) {
  const rows = ROWS.filter((r) => DEPLOYMENT.assets[r.id]);
  const key = `${shockBps}:${feedback}:${steps}:${rounds}`;
  const [state, setState] = useState<{ key: string; results: (Result | null)[] } | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      Promise.all(
        rows.map((r) =>
          previewScenario({
            assetId: r.id,
            shockBps,
            steps,
            maxRoundsPerStep: rounds,
            maxPositions: DEPLOYMENT.assets[r.id].realPositions,
            oracleFeedbackBps: feedback,
          }).catch(() => null),
        ),
      ).then((results) => live && setState({ key, results }));
    }, 900);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // rows derive from static config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const results = state?.key === key ? state.results : null;
  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Monad ↔ Ethereum: aynı şok</h3>
        <span className="text-xs text-muted">
          −%{fmtNum(shockBps / 100, 1)} · {feedback ? "oracle havuz fiyatını izler" : "oracle dış fiyatı izler"} · veriler iki ağdan, hesap Monad'da
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">Defter</th>
              <th>Borç</th>
              <th>Havuz derinliği</th>
              <th title="Satışların gittiği havuzun, riskteki borca oranı">Derinlik / borç</th>
              <th>Karşılıksız kalan</th>
              <th>Likide edilemeyen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const a = DEPLOYMENT.assets[row.id];
              const r = results?.[i];
              const ratio = a.depthUsd / Math.max(1, a.debtUsd);
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-2">
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${row.chain === "Monad" ? "bg-accent/20 text-accent" : "bg-panel-2 text-muted"}`}>
                      {row.chain}
                    </span>
                    {a.symbol.replace(" (Ethereum)", "")}
                    {row.note && <span className="ml-1 text-xs text-muted">· {row.note}</span>}
                  </td>
                  <td className="num">{fmtUsd(a.debtUsd)}</td>
                  <td className="num">
                    {fmtUsd(a.depthUsd)}
                    {a.depthIsAssumption && <span className="ml-1 text-xs text-warn">varsayım</span>}
                  </td>
                  <td className={`num ${ratio < 0.1 ? "text-warn" : "text-good"}`}>%{fmtNum(ratio * 100, ratio < 1 ? 1 : 0)}</td>
                  <td className={`num font-bold ${r && r.badDebt > 0n ? "text-bad" : ""}`}>
                    {r ? fmtUsd(wadToNum(r.badDebt)) : "…"}
                  </td>
                  <td className={`num ${r && r.stuckDebt > 0n ? "text-warn" : ""}`}>{r ? fmtUsd(wadToNum(r.stuckDebt)) : "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Derinlik tek başına değil, <b className="text-text">riskteki borca oranla</b> önemli. Ethereum'daki USDe havuzu
        Monad'dakinden ~48 kat derin ama üstündeki borç da 11 kat büyük; USDC'nin havuzu ise borcun yüzlerce katı, bu yüzden
        %10'luk düşüşte bile karşılıksız borç çıkmıyor.
      </p>
    </div>
  );
}
