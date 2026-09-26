"use client";

import { useEffect, useState } from "react";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { kaskadMCAbi } from "@/lib/kaskad/abi";
import { publicClient } from "@/lib/kaskad/burner";
import { sendTx } from "@/lib/kaskad/signer";
import { DEPLOYMENT, txUrl } from "@/lib/kaskad/config";
import { fmtBytes, fmtGas, fmtNum, fmtPct, fmtUsd, wadToNum } from "@/lib/kaskad/format";
import { MONAD_MEMORY_LIMIT, MONAD_TX_GAS_LIMIT } from "@/lib/kaskad/math";
import { monteCarloGasLimit } from "@/lib/kaskad/math";
import { confirmCost, CostTag } from "./CostTag";
import type { Scenario } from "./useKaskad";

type MC = {
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

const SEED = 1n;
const MAX_PATHS = 2_000;

async function previewMC(s: Scenario, paths: number): Promise<MC | null> {
  const mc = DEPLOYMENT.contracts.kaskadMC;
  if (!mc) return null;
  const data = encodeFunctionData({ abi: kaskadMCAbi, functionName: "previewMC", args: [s, BigInt(paths), SEED] });
  try {
    const res = await publicClient.call({ to: mc, data, gas: BigInt(MONAD_TX_GAS_LIMIT) });
    if (!res.data) return null;
    return decodeFunctionResult({ abi: kaskadMCAbi, functionName: "previewMC", data: res.data }) as unknown as MC;
  } catch {
    return null; // out of gas at 30M (or invalid): does not fit in one transaction
  }
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" }) {
  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className={`num text-xl font-bold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export function MonteCarlo({ base, symbol }: { base: Scenario; symbol: string }) {
  const [paths, setPaths] = useState(30);
  const [state, setState] = useState<{ key: string; r: MC | null } | null>(null);
  const [limit, setLimit] = useState<{ key: string; k: number; r: MC | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const scKey = JSON.stringify(base);
  const key = `${scKey}:${paths}`;
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      previewMC(JSON.parse(scKey), paths).then((r) => live && setState({ key, r }));
    }, 800);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, scKey, paths]);

  const r = state?.key === key ? state.r : null;
  const lim = limit?.key === scKey ? limit : null;

  /** Largest K that still fits in 30M gas, by binary search over eth_call (each ~1 request). */
  async function findLimit() {
    setSearching(true);
    const s = JSON.parse(scKey) as Scenario;
    let lo = 0;
    let hi = MAX_PATHS;
    let best: MC | null = null;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const res = await previewMC(s, mid);
      if (res) {
        lo = mid;
        best = res;
      } else hi = mid - 1;
    }
    setLimit({ key: scKey, k: lo, r: best });
    setSearching(false);
  }

  async function prove() {
    if (!r || !DEPLOYMENT.contracts.kaskadMC) return;
    const gas = monteCarloGasLimit(r.gasUsed);
    if (!confirmCost(gas)) return;
    setSending(true);
    setTxHash(null);
    try {
      const data = encodeFunctionData({ abi: kaskadMCAbi, functionName: "simulateMC", args: [base, BigInt(paths), SEED] });
      const { receipt, ms } = await sendTx(DEPLOYMENT.contracts.kaskadMC, data, gas, setTxMsg);
      setTxHash(receipt.transactionHash);
      setTxMsg(receipt.status === "success" ? `Zincirde: ${paths} senaryo tek tx'te, ${Math.round(ms)} ms.` : "Tx revert etti.");
    } catch (e) {
      setTxMsg(`Hata: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setSending(false);
    }
  }

  if (!DEPLOYMENT.contracts.kaskadMC) return null;
  const debt = r ? wadToNum(r.totalDebt) : 0;
  const points = r
    ? r.shockBps.map((sh, i) => ({ shock: Number(sh) / 100, bad: wadToNum(r.badDebt[i]) / 1e6 }))
    : [];

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Monte Carlo: {fmtNum(paths)} rastgele senaryo × {symbol} gerçek defteri, tek tx
        </h3>
        <span className="text-xs text-muted">
          her senaryo: son düşüş = ortalama %{fmtNum(base.shockBps / 100, 1)} × 3u² (en fazla 3 katı), rastgele yol
        </span>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-sm">
          <span>Senaryo sayısı (K)</span>
          <span className="num font-mono font-bold text-accent">{fmtNum(paths)}</span>
        </div>
        <input type="range" min={1} max={lim?.k || 100} step={1} value={paths} onChange={(e) => setPaths(+e.target.value)} />
      </div>

      {r ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="ortalama karşılıksız borç" value={fmtUsd(wadToNum(r.meanBadDebt))} tone="bad" />
            <Stat label="%95'lik dilim (20 senaryodan 1'i daha kötü)" value={fmtUsd(wadToNum(r.p95BadDebt))} tone="bad" />
            <Stat
              label={`en kötü senaryo (−%${fmtNum(Number(r.worstShockBps) / 100, 1)})`}
              value={fmtUsd(wadToNum(r.worstBadDebt))}
              tone="bad"
            />
            <Stat
              label="zarar çıkan senaryo oranı"
              value={fmtPct(Number(r.lossPaths) / Number(r.paths), 0)}
              tone="warn"
            />
          </div>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={180}>
              <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#242a3a" />
                <XAxis type="number" dataKey="shock" name="düşüş" unit="%" tick={{ fill: "#8b92a8", fontSize: 11 }} />
                <YAxis type="number" dataKey="bad" name="karşılıksız" unit="M" tick={{ fill: "#8b92a8", fontSize: 11 }} width={48} />
                <Tooltip
                  contentStyle={{ background: "#10131b", border: "1px solid #242a3a", borderRadius: 8 }}
                  formatter={(v, n) => (n === "düşüş" ? `%${Number(v).toFixed(2)}` : `$${Number(v).toFixed(2)}M`)}
                />
                <Scatter data={points} fill="#ff4d5e" isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>Gas</span>
                <span className="num font-mono">
                  {fmtGas(Number(r.gasUsed))} / 30M · %{fmtNum((Number(r.gasUsed) / MONAD_TX_GAS_LIMIT) * 100, 1)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, (Number(r.gasUsed) / MONAD_TX_GAS_LIMIT) * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>Bellek</span>
                <span className="num font-mono">
                  {fmtBytes(Number(r.memoryBytes))} / 8 MB · %{fmtNum((Number(r.memoryBytes) / MONAD_MEMORY_LIMIT) * 100, 2)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full bg-good" style={{ width: `${Math.max(0.5, (Number(r.memoryBytes) / MONAD_MEMORY_LIMIT) * 100)}%` }} />
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Bellek K ile büyümüyor: her senaryo defterin bir kopyası üzerinde çalışıyor, bitince bellek geri alınıyor; yalnızca
            senaryo başına 3 sonuç word'ü (96 byte) birikiyor. Sınırı bu yüzden bellek değil <b className="text-text">gas</b>{" "}
            belirliyor. Defter borcu: {fmtUsd(debt)}.
          </p>
        </>
      ) : (
        <div className="py-10 text-center text-muted">{state ? "Bu K 30M gas'a sığmıyor; K'yı azalt." : "hesaplanıyor…"}</div>
      )}

      <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <b>Monad'ın bir işleme sığdırabildiği en büyük stres testi</b>
            {lim ? (
              <div className="mt-1 text-muted">
                <span className="num text-2xl font-black text-accent">{fmtNum(lim.k)}</span> senaryo ×{" "}
                {fmtNum(base.maxPositions)} pozisyon ={" "}
                <b className="text-text">{fmtNum(lim.k * base.maxPositions)}</b> pozisyon-senaryosu
                {lim.r && (
                  <>
                    {" "}
                    · gas {fmtGas(Number(lim.r.gasUsed))} · bellek {fmtBytes(Number(lim.r.memoryBytes))}
                  </>
                )}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted">Bu senaryo ayarlarıyla 30M gas'a sığan en büyük K'yı canlı ölçer (ikili arama, ~11 eth_call).</div>
            )}
          </div>
          <div className="flex gap-2">
            <div>
              <button
                onClick={findLimit}
                disabled={searching}
                className="w-full rounded-lg border border-accent px-3 py-2 text-sm hover:bg-accent/20 disabled:opacity-50"
              >
                {searching ? "Ölçülüyor…" : "Sınırı bul"}
              </button>
              <CostTag free />
            </div>
            <div>
              <button
                onClick={prove}
                disabled={!r || sending}
                className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Gönderiliyor…" : "Zincirde kanıtla"}
              </button>
              <CostTag gasLimit={r ? monteCarloGasLimit(r.gasUsed) : null} />
            </div>
          </div>
        </div>
        {txMsg && (
          <div className="mt-2 text-xs text-muted">
            {txMsg}{" "}
            {txHash && (
              <a className="text-accent underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                MonadScan ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
