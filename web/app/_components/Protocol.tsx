"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { decodeEventLog, encodeFunctionData } from "viem";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { ensureFunded, getBurner, sendBurnerTx } from "@/lib/kaskad/burner";
import { CALIBRATED, DEPLOYMENT, RESOLUTIONS, UI_ASSETS, addrUrl, txUrl } from "@/lib/kaskad/config";
import { fmtNum, fmtPct, fmtUsd, shortAddr, wadToNum } from "@/lib/kaskad/format";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { MAX_FEE_PER_GAS } from "@/lib/kaskad/tx";
import { CascadeChart, CurveChart } from "./Charts";
import { GuardPanel } from "./GuardPanel";
import { LimitGauge } from "./LimitGauge";
import { previewCurve, usePreview, type Scenario } from "./useKaskad";

const CURVE_SHOCKS = [100, 200, 300, 500, 800, 1000, 1500, 2000];
const BASE_FEE_GWEI = 102n; // what the chain actually charges today (min base fee 100 gwei + tip)

type TxInfo = { hash: string; ms: number; sync: boolean; gasLimit: bigint; status: string };

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "";
  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className={`num text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`rounded-lg border px-3 py-2 text-left text-sm ${
            o.v === value ? "border-accent bg-accent/15" : "border-line hover:border-muted"
          }`}
        >
          <div className="font-medium">{o.label}</div>
          {o.hint && <div className="text-xs text-muted">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function Protocol() {
  const [assetId, setAssetId] = useState(9);
  const [shockPct, setShockPct] = useState(3);
  const [steps, setSteps] = useState(20);
  const [rounds, setRounds] = useState(3);
  const [feedback, setFeedback] = useState(10_000);
  const [calibrated, setCalibrated] = useState(false);
  const [resolution, setResolution] = useState(2_000);
  const [tx, setTx] = useState<TxInfo | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [curveState, setCurveState] = useState<{
    key: string;
    market: readonly bigint[];
    rate: readonly bigint[];
  } | null>(null);
  const burner = useSyncExternalStore(
    () => () => {},
    () => getBurner().address,
    () => null,
  );

  const asset = DEPLOYMENT.assets[assetId];
  const canCalibrate = asset.calibratedPositions > 0;
  const useCal = calibrated && canCalibrate;
  const maxRes = Math.min(resolution, asset.calibratedPositions || resolution);

  const scenario: Scenario = useMemo(
    () => ({
      assetId: useCal ? CALIBRATED | assetId : assetId,
      shockBps: Math.round(shockPct * 100),
      steps,
      maxRoundsPerStep: rounds,
      maxPositions: useCal ? maxRes : asset.realPositions,
      oracleFeedbackBps: feedback,
    }),
    [assetId, shockPct, steps, rounds, feedback, useCal, maxRes, asset.realPositions],
  );
  const { result: r, error, loading, ms } = usePreview(scenario);

  // stress curve on the real book, both oracle modes (2 eth_calls, only when the asset/path changes)
  const curveKey = `${assetId}:${steps}:${rounds}`;
  useEffect(() => {
    let live = true;
    const base = { assetId, shockBps: 0, steps, maxRoundsPerStep: rounds, maxPositions: asset.realPositions };
    Promise.all([
      previewCurve({ ...base, oracleFeedbackBps: 10_000 }, CURVE_SHOCKS),
      previewCurve({ ...base, oracleFeedbackBps: 0 }, CURVE_SHOCKS),
    ])
      .then(([m, k]) => live && setCurveState({ key: curveKey, market: m.bad, rate: k.bad }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [curveKey, assetId, steps, rounds, asset.realPositions]);
  const curve = curveState?.key === curveKey ? curveState : null;

  // amounts on a partial calibrated book are scaled to the full book's debt
  const scale = r && useCal ? asset.debtUsd / Math.max(1, wadToNum(r.totalDebt)) : 1;
  const gasLimit = r ? simulateGasLimit(r.gasUsed, r.rounds) : 0n;
  const costMon = Number(gasLimit * BASE_FEE_GWEI) / 1e9;

  async function simulate() {
    if (!r) return;
    setSending(true);
    setTx(null);
    try {
      await ensureFunded(gasLimit * MAX_FEE_PER_GAS, setTxStatus);
      setTxStatus("simulate() gönderiliyor (eth_sendRawTransactionSync)…");
      const data = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] });
      const { receipt, ms, sync } = await sendBurnerTx(DEPLOYMENT.contracts.kaskad, data, gasLimit);
      setTx({ hash: receipt.transactionHash, ms, sync, gasLimit, status: receipt.status });
      const done = receipt.logs
        .map((l) => {
          try {
            return decodeEventLog({ abi: kaskadAbi, data: l.data, topics: l.topics });
          } catch {
            return null;
          }
        })
        .find((e) => e?.eventName === "SimulationDone");
      setTxStatus(
        receipt.status === "success"
          ? `Zincirde doğrulandı: ${fmtNum(r.rounds)} tur, SimulationDone${done ? "" : " (event bulunamadı)"}.`
          : "Tx revert etti.",
      );
    } catch (e) {
      setTxStatus(`Hata: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setSending(false);
    }
  }

  const t = DEPLOYMENT.totals;
  const syrup = DEPLOYMENT.assets[9];

  return (
    <div className="space-y-6">
      {/* headline */}
      <section className="card p-6">
        <div className="text-sm text-muted">Monad'daki Aave</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <span className="num text-4xl font-bold">{fmtUsd(t.suppliedUsd)}</span> <span className="text-muted">teminat</span>
          </div>
          <div>
            <span className="num text-4xl font-bold">{fmtUsd(t.debtUsd)}</span> <span className="text-muted">borç</span>
          </div>
          <div>
            <span className="num text-4xl font-bold">{t.positions}</span> <span className="text-muted">borçlu pozisyon</span>
          </div>
        </div>
        <div className="mt-3 text-sm">
          En büyük risk: <b>syrupUSDC {fmtUsd(syrup.collateralUsd)}</b> teminat, <b>%{syrup.ltBps / 100}</b> likidasyon
          eşiği (E-Mode), üstünde {fmtUsd(syrup.debtUsd)} borç.
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-good/15 px-2 py-1 text-good">
            Gerçek veri · Monad mainnet blok #{fmtNum(DEPLOYMENT.source.block)}
          </span>
          <span className="rounded-full bg-panel-2 px-2 py-1 text-muted">Envio HyperSync + multicall</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* scenario form */}
        <section className="card space-y-5 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Senaryo</h3>
          <div>
            <div className="mb-2 text-sm">Varlık</div>
            <Seg
              value={assetId}
              onChange={setAssetId}
              options={UI_ASSETS.map((a) => ({
                v: a.id,
                label: a.symbol.replace("-8OCT2026", ""),
                hint: `${fmtUsd(a.collateralUsd)} · LT %${a.ltBps / 100}`,
              }))}
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Şok (depeg)</span>
              <span className="num font-mono font-bold text-bad">−%{shockPct}</span>
            </div>
            <input type="range" min={0} max={20} step={0.5} value={shockPct} onChange={(e) => setShockPct(+e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>Süre</span>
                <span className="num font-mono">{steps} blok</span>
              </div>
              <input type="range" min={1} max={100} value={steps} onChange={(e) => setSteps(+e.target.value)} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>Dalga/blok</span>
                <span className="num font-mono">{rounds}</span>
              </div>
              <input type="range" min={1} max={20} value={rounds} onChange={(e) => setRounds(+e.target.value)} />
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm">Oracle</div>
            <Seg
              value={feedback}
              onChange={setFeedback}
              options={[
                { v: 10_000, label: "Piyasa oracle'ı", hint: "DEX fiyatını izler" },
                { v: 0, label: "Kur oracle'ı", hint: "yalnızca şoku görür" },
              ]}
            />
          </div>
          <div>
            <div className="mb-2 text-sm">Defter</div>
            <Seg
              value={useCal ? "cal" : "real"}
              onChange={(v) => setCalibrated(v === "cal")}
              options={[
                { v: "real", label: `Gerçek (${asset.realPositions})`, hint: "Aave'deki pozisyonlar" },
                ...(canCalibrate
                  ? [{ v: "cal", label: `Kalibre (${fmtNum(asset.calibratedPositions)})`, hint: "gerçek HF dağılımı" }]
                  : []),
              ]}
            />
            {useCal && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span>Çözünürlük</span>
                  <span className="num font-mono font-bold text-accent">{fmtNum(maxRes)} pozisyon</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={RESOLUTIONS.filter((x) => x <= asset.calibratedPositions).length - 1}
                  value={Math.max(0, RESOLUTIONS.indexOf(maxRes))}
                  onChange={(e) => setResolution(RESOLUTIONS[+e.target.value])}
                />
              </div>
            )}
          </div>
          <div className="rounded-lg bg-panel-2 p-3 text-xs text-muted">
            Havuz derinliği: <b className="text-text">{fmtUsd(asset.depthUsd)}</b>{" "}
            {asset.depthIsAssumption ? (
              <span className="rounded bg-warn/20 px-1 text-warn">varsayım</span>
            ) : (
              <span className="rounded bg-good/20 px-1 text-good">ölçüldü</span>
            )}
            <div className="mt-1">{asset.depthNote}</div>
            {assetId === 12 && <div className="mt-1">PT-AUSD 8 Ekim 2026'da vadesine eriyor; fiyatı 1'e yakınsıyor.</div>}
          </div>
          <button
            onClick={simulate}
            disabled={!r || sending || !!error}
            className="w-full rounded-lg bg-accent px-4 py-3 text-lg font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {sending ? "Gönderiliyor…" : "Simüle et (zincirde)"}
          </button>
          <div className="text-xs text-muted">
            Önizleme ücretsiz (eth_call). Zincir tx'i: gas limiti {fmtNum(Number(gasLimit))} ≈{" "}
            <b className="text-text">{costMon.toFixed(3)} MON</b> (Monad gas'ı limitten keser).
            {burner && (
              <>
                {" "}
                Burner:{" "}
                <a className="underline" href={addrUrl(burner)} target="_blank" rel="noreferrer">
                  {shortAddr(burner)}
                </a>{" "}
                (yalnızca testnet, yalnızca bu uygulama).
              </>
            )}
          </div>
        </section>

        {/* results */}
        <section className="space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-wider text-muted">Kötü borç</div>
                <div className="num text-7xl font-black leading-none text-bad md:text-8xl">
                  {r ? fmtUsd(wadToNum(r.badDebt) * scale) : "…"}
                </div>
                {r && (
                  <div className="mt-2 text-sm text-muted">
                    borcun {fmtPct(wadToNum(r.badDebt) / Math.max(1, wadToNum(r.totalDebt)))}'i
                    {useCal && " · tam deftere ölçeklendi"}
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-muted">
                {loading ? "hesaplanıyor…" : r ? `önizleme ${Math.round(ms)} ms` : ""}
                <div>{useCal ? "Kalibre veri (gerçek toplamlar)" : "Gerçek Aave pozisyonları"}</div>
              </div>
            </div>
            {error && <div className="mt-3 rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">{error}</div>}
            {r && (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="likide edilen borç" value={fmtUsd(wadToNum(r.totalLiquidated) * scale)} />
                  <Stat label="tıkanan borç (HF<1, kârsız)" value={fmtUsd(wadToNum(r.stuckDebt) * scale)} tone="warn" />
                  <Stat label={`tur · ${fmtNum(r.liquidations)} likidasyon`} value={fmtNum(r.rounds)} />
                  <Stat
                    label="son fiyat"
                    value={`$${wadToNum(r.finalPrice).toFixed(3)}`}
                    tone={r.finalPrice < r.startPrice / 2n ? "bad" : undefined}
                  />
                </div>
                <div className="mt-5">
                  {r.log.length ? (
                    <CascadeChart r={r} />
                  ) : (
                    <div className="py-10 text-center text-muted">Bu şokta likidasyon yok.</div>
                  )}
                </div>
              </>
            )}
            {(txStatus || tx) && (
              <div className="mt-4 rounded-lg border border-line p-3 text-sm">
                {txStatus}{" "}
                {tx && (
                  <>
                    <span className="num font-mono">{Math.round(tx.ms)} ms</span>{" "}
                    <span className="rounded bg-panel-2 px-1 text-xs">{tx.sync ? "sendRawTransactionSync" : "async"}</span>{" "}
                    <a className="text-accent underline" href={txUrl(tx.hash)} target="_blank" rel="noreferrer">
                      MonadScan'de gör ↗
                    </a>
                  </>
                )}
              </div>
            )}
          </div>

          {r && <LimitGauge r={r} />}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GuardPanel />
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Stres eğrisi: {asset.symbol.replace("-8OCT2026", "")}
            </h3>
            <span className="text-xs text-muted">kötü borç, şok başına · tek eth_call</span>
          </div>
          {curve ? (
            <CurveChart shocks={CURVE_SHOCKS} market={curve.market} rate={curve.rate} />
          ) : (
            <div className="py-16 text-center text-muted">hesaplanıyor…</div>
          )}
          <p className="mt-2 text-xs text-muted">
            Aynı defter, aynı şok: oracle DEX fiyatını izlerse likidatörlerin satışı fiyatı düşürür, fiyat yeni likidasyon
            tetikler (sarmal). Kur oracle'ında sarmal kırılır ama ince havuzda likidasyonlar kârsız kalır ve borç tıkanır.
          </p>
        </div>
      </div>
    </div>
  );
}
