"use client";
import { useSigner } from "@/components/ui/use-signer";

import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, encodeFunctionData } from "viem";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { sendTx, signerLabel } from "@/lib/kaskad/signer";
import { CALIBRATED, DEPLOYMENT, RESOLUTIONS, UI_ASSETS, addrUrl, txUrl, type AssetInfo } from "@/lib/kaskad/config";
import { fmtNum, fmtPct, fmtUsd, shortAddr, wadToNum } from "@/lib/kaskad/format";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { CascadeChart, CurveChart } from "./Charts";
import { RevealSections } from "@/components/visual/Reveal";
import { Hero } from "@/components/sections/Hero";
import { AnimatedNumber } from "@/components/visual/AnimatedNumber";
import { DominoCascade } from "@/components/visual/DominoCascade";
import { Details, Help } from "@/components/ui/disclosure";
import { TransactionFeedback } from "@/components/ui/feedback";
import { Activity, Waves, Flame, Droplets, TrendingDown, Timer, Layers3, Zap, Check, SlidersHorizontal, ArrowUpRight } from "lucide-react";
import { ComparePanel } from "./ComparePanel";
import { confirmCost, CostTag } from "./CostTag";
import { GuardPanel } from "./GuardPanel";
import { LimitGauge } from "./LimitGauge";
import { MonteCarlo } from "./MonteCarlo";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import { engineFor, previewCurve, usePreview, type Result, type Scenario } from "./useKaskad";

const CURVE_SHOCKS = [10, 50, 100, 300, 500, 1000, 2000, 3000];
const ETH_SYRUP = 15; // syrupUSDT positions from Aave on Ethereum, simulated on Monad
const ETH_BOOKS = [7, 13, 14, 15]; // books read from Aave on Ethereum

type TxInfo = { hash: string; ms: number; sync: boolean };

type Settings = {
  assetId: number;
  shockPct: number;
  steps: number;
  rounds: number;
  feedback: number;
  calibrated: boolean;
  resolution: number;
};

type Preset = { id: string; emoji: string; title: string; story: string; s: Settings };

const BASE: Settings = {
  assetId: 9,
  shockPct: 3,
  steps: 20,
  rounds: 3,
  feedback: 0, // realistic default: the oracle follows the external price (Chainlink / exchange rate)
  calibrated: false,
  resolution: 10_000,
};

const PRESETS: Preset[] = [
  {
    id: "ufak",
    emoji: "🌤️",
    title: "Ufak sarsıntı",
    story: "syrupUSDC borsada %0,3 kayıyor. Bu kadarı bile bir şey başlatır mı?",
    s: { ...BASE, shockPct: 0.3 },
  },
  {
    id: "sali",
    emoji: "🌪️",
    title: "Salı Depegi",
    story: "syrupUSDC %3 düşüyor. Havuz o kadar sığ ki likidatörler borcu temizleyemiyor.",
    s: { ...BASE },
  },
  {
    id: "worst",
    emoji: "💥",
    title: "En kötü durum: oracle havuza bağlı",
    story: "Aynı %3, ama oracle anlık DEX fiyatını izlese (manipülasyona açık tasarım): sarmal.",
    s: { ...BASE, feedback: 10_000 },
  },
  {
    id: "pt",
    emoji: "⏳",
    title: "PT vade telaşı",
    story: "Vadesine 12 gün kalan PT-AUSD %1 iskontoya düşüyor.",
    s: { ...BASE, assetId: 12, shockPct: 1 },
  },
  {
    id: "maple-eth",
    emoji: "🌊",
    title: "Aynı döngü, Ethereum'da",
    story: "Ethereum Aave'deki syrupUSDT borçluları: aynı Maple döngüsü, $98,8M borç. Hesap yine Monad'da.",
    s: { ...BASE, assetId: ETH_SYRUP },
  },
  {
    id: "eth",
    emoji: "📉",
    title: "ETH %20 çakılırsa",
    story: "Klasik pozisyon: ETH yatır, USDC borç al. Ethereum Aave'de $513M borç, ETH %20 düşüyor.",
    s: { ...BASE, assetId: 7, shockPct: 20 },
  },
  {
    id: "derin",
    emoji: "💧",
    title: "Derin havuz: USDC",
    story: "Ethereum'da USDC teminatı %10 düşüyor. Havuz borcun yüzlerce katı derin.",
    s: { ...BASE, assetId: 13, shockPct: 10 },
  },
  {
    id: "stres",
    emoji: "🔥",
    title: "10.000 pozisyon stres testi",
    story: "Gerçek dağılımdan 10.000 pozisyon, tek tx. Ethereum'a sığmaz.",
    s: { ...BASE, calibrated: true, resolution: 10_000 },
  },
];

const sym = (a: AssetInfo) => a.symbol.replace("-8OCT2026", "");
const usd = (w: bigint, scale = 1) => fmtUsd(wadToNum(w) * scale);

/** Plain-Turkish story of what the cascade did. */
function narrate(r: Result, a: AssetInfo, s: Settings, scale: number): string {
  const rec = RECOVERY_BPS[a.id]?.bps ?? 0;
  const name = sym(a);
  const p0 = wadToNum(r.startPrice);
  const pf = wadToNum(r.finalPrice);
  const drop = 1 - pf / p0;
  if (r.liquidations === 0)
    return `${name} ${s.steps} blokta %${fmtNum(s.shockPct, 1)} düşse de hiçbir pozisyon likidasyon eşiğine inmiyor. Protokol bu şoku kayıpsız atlatıyor.`;
  let t = `${name} ${s.steps} blokta %${fmtNum(s.shockPct, 1)} düşünce ${fmtNum(r.liquidations)} likidasyon başlıyor: likidatörler borcu ödeyip el koydukları teminatı ${fmtUsd(a.depthUsd)} derinliğindeki havuzda satıyor. `;
  t +=
    s.feedback > 0
      ? `Oracle zincir üstü havuz fiyatını izlediği için her satış fiyatı daha da düşürüyor ve yeni likidasyonlar tetikliyor: fiyat $${p0.toFixed(3)} → $${pf.toFixed(3)} (−${fmtPct(drop, 0)}). `
      : `Oracle dış fiyatı (Chainlink / kur) izlediği için satışlar oracle'ı düşürmüyor, sarmal oluşmuyor. ${
          rec >= 5_000
            ? "Arbitrajcılar havuzu her blokta dış fiyata geri çektiği için likidatörler satmaya devam edebiliyor. "
            : "Ama havuzu dışarıdan dolduran arbitraj yok denecek kadar az: likidatör bir noktadan sonra zarar edeceği için satmayı bırakıyor. "
        }`;
  const bad = wadToNum(r.badDebt) * scale;
  const stuck = wadToNum(r.stuckDebt) * scale;
  t +=
    bad > 0
      ? `Sonuç: ${usd(r.totalDebt, scale)} borcun ${fmtUsd(bad)}'ı karşılıksız kalıyor. Bu parayı protokol, yani mevduat sahipleri öder.`
      : `Sonuç: karşılıksız borç yok.`;
  if (stuck > 0) t += ` Ama ${fmtUsd(stuck)} borç likide edilemeden bekliyor; fiyat biraz daha düşerse o da karşılıksız kalır.`;
  return t;
}

function Stat({ label, hint, value, tone }: { label: string; hint?: string; value: string; tone?: "bad" | "warn" }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="rounded-lg bg-panel-2 p-3" title={hint}>
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
          key={String(o.v)} aria-pressed={o.v === value}
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
  const [st, setSt] = useState<Settings>(PRESETS[1].s);
  const [presetId, setPresetId] = useState<string | null>("sali");
  const [tx, setTx] = useState<TxInfo | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [curveState, setCurveState] = useState<{
    key: string;
    market: readonly bigint[];
    rate: readonly bigint[];
  } | null>(null);
  const signer = useSigner();

  const presets = PRESETS.filter((p) => DEPLOYMENT.assets[p.s.assetId]);
  const set = (patch: Partial<Settings>) => {
    setSt((s) => ({ ...s, ...patch }));
    setPresetId(null);
  };

  const asset = DEPLOYMENT.assets[st.assetId];
  const canCalibrate = asset.calibratedPositions > 0;
  const useCal = st.calibrated && canCalibrate;
  const resOptions = RESOLUTIONS.filter((x) => x <= asset.calibratedPositions);
  const maxRes = Math.min(st.resolution, asset.calibratedPositions || st.resolution);

  const scenario: Scenario = useMemo(
    () => ({
      assetId: useCal ? CALIBRATED | st.assetId : st.assetId,
      shockBps: Math.round(st.shockPct * 100),
      steps: st.steps,
      maxRoundsPerStep: st.rounds,
      maxPositions: useCal ? maxRes : asset.realPositions,
      oracleFeedbackBps: st.feedback,
    }),
    [st, useCal, maxRes, asset.realPositions],
  );
  const { result: r, error, loading, ms } = usePreview(scenario);

  // stress curve on the real book, both oracle modes (2 eth_calls, only when the asset/path changes)
  const curveKey = `${st.assetId}:${st.steps}:${st.rounds}`;
  useEffect(() => {
    let live = true;
    const base = {
      assetId: st.assetId,
      shockBps: 0,
      steps: st.steps,
      maxRoundsPerStep: st.rounds,
      maxPositions: asset.realPositions,
    };
    Promise.all([
      previewCurve({ ...base, oracleFeedbackBps: 10_000 }, CURVE_SHOCKS),
      previewCurve({ ...base, oracleFeedbackBps: 0 }, CURVE_SHOCKS),
    ])
      .then(([m, k]) => live && setCurveState({ key: curveKey, market: m.bad, rate: k.bad }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [curveKey, st.assetId, st.steps, st.rounds, asset.realPositions]);
  const curve = curveState?.key === curveKey ? curveState : null;

  // amounts on a partial calibrated book are scaled to the full book's debt
  const scale = r && useCal ? asset.debtUsd / Math.max(1, wadToNum(r.totalDebt)) : 1;
  const gasLimit = r ? simulateGasLimit(r.gasUsed, r.rounds) : 0n;

  async function simulate() {
    if (!r || !confirmCost(gasLimit)) return;
    setSending(true);
    setTx(null);
    try {
      const data = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] });
      const { receipt, ms, sync } = await sendTx(engineFor(scenario.assetId), data, gasLimit, setTxStatus);
      setTx({ hash: receipt.transactionHash, ms, sync });
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
          ? `Zincirde doğrulandı: ${fmtNum(r.rounds)} dalga, sonuç SimulationDone event'inde${done ? "" : " (event bulunamadı)"}.`
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
  const isEth = ETH_BOOKS.includes(st.assetId);

  const icons = [Activity, Waves, Flame, Timer, Layers3, TrendingDown, Droplets, Zap];
  const shortTitles = ["Ufak sarsıntı", "Salı depegi", "En kötü durum", "PT vade telaşı", "Ethereum döngüsü", "ETH %20 düşerse", "Derin havuz", "10.000 pozisyon"];
  const shortStories = ["syrupUSDC · %0,3", "syrupUSDC · %3 depeg", "Havuz oracle", "PT-AUSD · %1", "syrupUSDT · Aave", "WETH · %20", "USDC · %10", "Kalibre veri"];

  return (
    <>
      <RevealSections />
      <Hero result={r} loading={loading} ms={ms} tx={tx} />
      <div className="protocol-stack">
        <section aria-label="Aave piyasa özeti">
          <div className="stat-strip">
            <div className="strip-stat"><span>Toplam teminat</span><strong className="num">{fmtUsd(t.suppliedUsd)}</strong></div>
            <div className="strip-stat"><span>Toplam borç</span><strong className="num">{fmtUsd(t.debtUsd)}</strong></div>
            <div className="strip-stat"><span>Borçlu pozisyon</span><strong className="num">{fmtNum(t.positions)}</strong></div>
            <div className="strip-stat"><span>syrupUSDC · risk odağı</span><strong className="num">{fmtUsd(syrup.collateralUsd)}</strong> <small>· %{syrup.ltBps / 100} eşik</small></div>
          </div>
          <div className="source-row"><span><span className="status-dot" /> Gerçek veri · Monad mainnet Aave</span><span>Blok #{fmtNum(DEPLOYMENT.source.block)} · Envio HyperSync + multicall</span></div>
        </section>

        <section id="senaryolar">
          <div className="section-heading"><h2><span className="index">01 /</span>Senaryonu seç</h2><span>Bir şok. Zincirleme etki.</span></div>
          <div className="presets-grid" role="region" aria-label="Senaryo şeridi" tabIndex={0}>
            {presets.map((p) => {
              const i = PRESETS.indexOf(p); const Icon = icons[i];
              return <button key={p.id} aria-pressed={presetId === p.id} onClick={() => { setSt(p.s); setPresetId(p.id); }} className="card preset-card">
                <span className="preset-icon"><Icon size={17} /></span>
                {presetId === p.id && <Check className="preset-check" size={14} />}
                <div className="preset-copy"><h3>{shortTitles[i]}</h3><p>{shortStories[i]}</p></div>
              </button>;
            })}
          </div>
        </section>

        <section id="sonuc">
          <div className="section-heading"><h2><span className="index">02 /</span>Şokun ardından</h2><span className="badge badge-violet">{useCal ? "Kalibre veri" : "Gerçek Aave pozisyonları"}</span></div>
          <div className="simulation-grid">
            <aside className="card settings-panel space-y-5" aria-label="Senaryo ayarları">
              <div className="settings-title"><SlidersHorizontal size={16} className="text-accent" /> Senaryo ayarları</div>
              <div className="asset-picker">
                <div className="mb-2 text-xs text-muted">Teminat varlığı</div>
                {[9,5].map(id => DEPLOYMENT.assets[id]).filter(Boolean).map(a => <button key={a.id} onClick={()=>set({assetId:a.id})} aria-pressed={st.assetId === a.id} className="asset-choice"><span className="asset-symbol">{a.id === 9 ? "$" : "Ξ"}</span><span>{sym(a)}<small>Monad Aave</small></span><span className="ml-auto text-[10px] text-muted">{fmtUsd(a.collateralUsd)}</span>{st.assetId === a.id && <Check size={13} className="text-accent" />}</button>)}
                <label htmlFor="other-asset" className="sr-only">Diğer tokenlar</label>
                <select id="other-asset" value={[9,5].includes(st.assetId) ? "" : st.assetId} onChange={e=>{if(e.target.value) set({assetId:+e.target.value});}} className="other-assets"><option value="" disabled>Diğer tokenlar</option>{UI_ASSETS.filter(a=>![9,5].includes(a.id)).map(a=><option key={a.id} value={a.id}>{sym(a)} · {ETH_BOOKS.includes(a.id) ? "Ethereum" : "Monad"}</option>)}</select>
              </div>
              <div>
                <label htmlFor="shock" className="flex justify-between text-xs"><span>Fiyat düşüşü</span><span className="num text-bad">−%{fmtNum(st.shockPct, 1)}</span></label>
                <input id="shock" type="range" min={0} max={50} step={0.1} value={st.shockPct} onChange={(e) => set({ shockPct: +e.target.value })} />
                <div className="grid grid-cols-4 gap-1">{[0.1,0.5,1,3,5,10,20,30].map(v => <button key={v} aria-pressed={st.shockPct === v} onClick={() => set({shockPct:v})} className={`rounded-lg border text-xs ${st.shockPct === v ? "border-accent/60 bg-accent/10 text-text" : "border-line text-muted"}`}>%{fmtNum(v,1)}</button>)}</div>
              </div>
              <div><div className="mb-2 text-xs text-muted">Oracle kaynağı</div><Seg value={st.feedback} onChange={v => set({feedback:v})} options={[{v:0,label:"Dış fiyat (Chainlink / kur)",hint:"Aave'nin kullandığı model"},{v:10_000,label:"Anlık havuz fiyatı",hint:"en kötü durum"}]} /></div>
              <Details title="Gelişmiş ayarlar">
                <div className="space-y-5">
                  <div><label htmlFor="blocks" className="flex justify-between"><span>Süre</span><span>{st.steps} blok</span></label><input id="blocks" type="range" min={1} max={100} value={st.steps} onChange={e=>set({steps:+e.target.value})} /></div>
                  <div><label htmlFor="rounds" className="flex justify-between"><span>Dalga / blok</span><span>{st.rounds}</span></label><input id="rounds" type="range" min={1} max={20} value={st.rounds} onChange={e=>set({rounds:+e.target.value})} /></div>
                  {canCalibrate && <div><div className="mb-2">Defter</div><Seg value={useCal ? "cal" : "real"} onChange={v=>set({calibrated:v==="cal"})} options={[{v:"real",label:`Gerçek (${fmtNum(asset.realPositions)})`},{v:"cal",label:`Kalibre (${fmtNum(asset.calibratedPositions)})`}]} />{useCal && <div className="mt-3"><label htmlFor="resolution">Çözünürlük · {fmtNum(maxRes)} pozisyon</label><input id="resolution" type="range" min={0} max={resOptions.length-1} value={Math.max(0,resOptions.indexOf(maxRes))} onChange={e=>set({resolution:resOptions[+e.target.value]})} /></div>}</div>}
                </div>
              </Details>
              <div className="text-xs text-muted"><div className="flex items-center justify-between">Havuz derinliği <span className="num text-text">{fmtUsd(asset.depthUsd)}</span></div><span className={`text-[10px] ${asset.depthIsAssumption ? "text-warn" : "text-good"}`}>{asset.depthIsAssumption ? "varsayım" : "ölçüldü"}</span><Help label="Havuz derinliği">{asset.depthNote}</Help></div>
              {!useCal && <div className="flex items-center justify-between text-xs text-muted"><span>Arbitraj toparlanması<br /><small className="text-warn">varsayım</small></span><span>%{fmtNum((RECOVERY_BPS[st.assetId]?.bps ?? 0)/100)}</span><Help label="Arbitraj varsayımı">{RECOVERY_BPS[st.assetId]?.why ?? "Toparlanma yok."}</Help></div>}
              {isEth && <div className="text-[10px] text-muted">Ethereum verisi · Monad simülasyonu</div>}
              {st.assetId === 12 && <div className="text-[10px] text-muted">PT-AUSD vadesi · 8 Ekim 2026</div>}
            </aside>

            <div className="card result-card" aria-busy={loading}>
              <div className="result-header"><span className="flex items-center gap-2"><span className="status-dot" /> {loading ? "Hesaplanıyor…" : r ? "Simülasyon tamamlandı" : "Önizleme bekleniyor"}</span><span>{sym(asset)} · −%{fmtNum(st.shockPct,1)}{st.feedback > 0 ? " · en kötü durum" : " · dış fiyat"}</span></div>
              <div className="result-counters">
                <div><div className="counter-label">Karşılıksız kalan borç<Help label="Karşılıksız kalan borç">Tüm teminat satılsa bile kapanmayan borç açığı.</Help></div><div className="counter-value num text-bad">{r ? <AnimatedNumber value={wadToNum(r.badDebt)*scale} /> : "—"}</div><div className="counter-note">{r ? `${fmtPct(wadToNum(r.badDebt)/Math.max(1,wadToNum(r.totalDebt)))} toplam borcun` : "Sonuç bekleniyor"}</div></div>
                <div><div className="counter-label">Anında likide edilemeyen borç<Help label="Likide edilemeyen borç">Havuz likiditesi yetersiz olduğu için kapatılamayan riskli borç.</Help></div><div className="counter-value num text-warn">{r ? <AnimatedNumber value={wadToNum(r.stuckDebt)*scale} /> : "—"}</div><div className="counter-note">{r ? `${fmtPct(wadToNum(r.stuckDebt)/Math.max(1,wadToNum(r.totalDebt)))} toplam borcun` : "Sonuç bekleniyor"}{useCal && " · ölçeklendi"}</div></div>
              </div>
              {error && <div role="alert" className="mt-5 rounded-xl border border-bad/30 bg-bad/5 p-3 text-xs text-bad">{error}</div>}
              {r ? <>
                <Details title="Ne oldu?">{narrate(r,asset,st,scale)}</Details>
                <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4"><Stat label="likide edilen" value={usd(r.totalLiquidated,scale)} /><Stat label="toplam borç" value={usd(r.totalDebt,scale)} /><Stat label={`${fmtNum(r.liquidations)} likidasyon`} value={`${fmtNum(r.rounds)} dalga`} /><Stat label="son fiyat" value={`$${fmtNum(wadToNum(r.finalPrice),3)}`} tone={r.finalPrice < r.startPrice/2n ? "bad" : undefined} /></div>
                {r.log.length ? <><DominoCascade key={`${scenario.assetId}-${scenario.shockBps}-${scenario.steps}-${scenario.maxRoundsPerStep}-${scenario.oracleFeedbackBps}-${scenario.maxPositions}-${r.finalPrice}`} result={r} scenario={scenario} /><div className="mt-3"><CascadeChart r={r} s={scenario} /></div></> : <div className="my-6 rounded-xl border border-good/15 bg-good/5 p-8 text-center text-sm text-good">Bu şokta likidasyon yok.</div>}
              </> : <div className="skeleton mt-6 h-56" aria-label="Simülasyon sonucu yükleniyor" />}
              <div className="result-proof"><div className="proof-meta"><span className="badge badge-violet">tek işlem · {r ? `${fmtNum(tx?.ms ?? ms)} ms · ${fmtNum(r.positionsUsed)} pozisyon` : "sonuç bekleniyor"}</span><div className="mt-2">{tx ? "Zincirdeki işlem süresi" : "Ücretsiz önizleme · eth_call"}</div>{signer.address && <a href={addrUrl(signer.address)} target="_blank" rel="noreferrer">{signerLabel[signer.kind]} · {shortAddr(signer.address)} ↗</a>}</div><div><button onClick={simulate} disabled={!r || sending || !!error || loading} className="button-primary disabled:opacity-40">{sending ? "Gönderiliyor…" : "Zincirde kanıtla"}<ArrowUpRight size={16} /></button><CostTag gasLimit={r ? gasLimit : null} /></div></div>
              {(txStatus || tx) && <div role="status" className="mt-4 rounded-xl border border-line p-3 text-xs text-muted">{txStatus}{tx && <div className="mt-2 flex flex-wrap gap-3"><span>{fmtNum(tx.ms)} ms</span><span>{tx.sync ? "sendRawTransactionSync" : "async"}</span><a href={txUrl(tx.hash)} target="_blank" rel="noreferrer" className="text-accent">MonadScan ↗</a></div>}</div>}
              <TransactionFeedback message={txStatus} />
            </div>
          </div>
        </section>

        <section><div className="section-heading"><h2><span className="index">03 /</span>Neden Monad</h2><span>Aynı hesap. Farklı sınırlar.</span></div>{r ? <LimitGauge r={r} /> : <div className="card skeleton h-72" aria-label="Ağ karşılaştırması yükleniyor" />}</section>
        <section><div className="section-heading"><h2><span className="index">04 /</span>Olasılıkları keşfet</h2><span>Monte Carlo</span></div><MonteCarlo base={{assetId:st.assetId,shockBps:scenario.shockBps,steps:st.steps,maxRoundsPerStep:st.rounds,maxPositions:asset.realPositions,oracleFeedbackBps:st.feedback}} symbol={sym(asset)} /></section>
        <section><div className="section-heading"><h2><span className="index">05 /</span>İki ağ, aynı şok</h2><span>Monad ↔ Ethereum</span></div><ComparePanel shockBps={scenario.shockBps} feedback={st.feedback} steps={st.steps} rounds={st.rounds} /><div className="card mt-5 p-6"><div className="mb-5 flex items-center justify-between"><h3 className="text-sm">Stres eğrisi · {sym(asset)}</h3><Help label="Stres eğrisi">Yeşil: dış fiyat oracle. Kırmızı: anlık havuz oracle, en kötü durum.</Help></div>{curve ? <CurveChart shocks={CURVE_SHOCKS} market={curve.market} rate={curve.rate} /> : <div className="skeleton h-52" aria-label="Stres eğrisi yükleniyor" />}<div className="mt-3 text-[10px] text-muted">Ücretsiz · tek eth_call / oracle</div></div></section>
        <section><div className="section-heading"><h2><span className="index">06 /</span>Riski gör. Borcu durdur.</h2><span>Kaskad Guard</span></div><GuardPanel /></section>
      </div>
    </>
  );
}