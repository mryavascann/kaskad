"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { decodeEventLog, encodeFunctionData } from "viem";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { ensureFunded, getBurner, sendBurnerTx } from "@/lib/kaskad/burner";
import { CALIBRATED, DEPLOYMENT, RESOLUTIONS, UI_ASSETS, addrUrl, txUrl, type AssetInfo } from "@/lib/kaskad/config";
import { fmtNum, fmtPct, fmtUsd, shortAddr, wadToNum } from "@/lib/kaskad/format";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { MAX_FEE_PER_GAS } from "@/lib/kaskad/tx";
import { CascadeChart, CurveChart } from "./Charts";
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
  const burner = useSyncExternalStore(
    () => () => {},
    () => getBurner().address,
    () => null,
  );

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
      await ensureFunded(gasLimit * MAX_FEE_PER_GAS, setTxStatus);
      setTxStatus("Zincire gönderiliyor (eth_sendRawTransactionSync)…");
      const data = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] });
      const { receipt, ms, sync } = await sendBurnerTx(engineFor(scenario.assetId), data, gasLimit);
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
          En büyük risk: <b>syrupUSDC {fmtUsd(syrup.collateralUsd)}</b> teminat. Borçlular %{syrup.ltBps / 100} eşikle
          (E-Mode) {fmtUsd(syrup.debtUsd)} borç almış: fiyat birkaç yüzde düşerse likide olurlar.
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-good/15 px-2 py-1 text-good">
            Gerçek veri · Monad mainnet blok #{fmtNum(DEPLOYMENT.source.block)}
          </span>
          <span className="rounded-full bg-panel-2 px-2 py-1 text-muted">Envio HyperSync + multicall</span>
        </div>
      </section>

      {/* presets */}
      <section>
        <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">1 · Bir senaryo seç</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSt(p.s);
                setPresetId(p.id);
              }}
              className={`card p-3 text-left transition hover:border-accent ${presetId === p.id ? "border-accent! bg-accent/10" : ""}`}
            >
              <div className="text-2xl">{p.emoji}</div>
              <div className="mt-1 font-semibold leading-tight">{p.title}</div>
              <div className="mt-1 text-xs text-muted">{p.story}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* settings */}
        <section className="card space-y-5 p-5">
          <div className="text-sm font-semibold uppercase tracking-wider text-muted">2 · İstersen ayarla</div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Fiyat ne kadar düşsün?</span>
              <span className="num font-mono font-bold text-bad">−%{fmtNum(st.shockPct, 1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={0.1}
              value={st.shockPct}
              onChange={(e) => set({ shockPct: +e.target.value })}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {[0.1, 0.5, 1, 3, 5, 10, 20, 30].map((v) => (
                <button
                  key={v}
                  onClick={() => set({ shockPct: v })}
                  className={`rounded border px-2 py-0.5 text-xs ${st.shockPct === v ? "border-accent" : "border-line"}`}
                >
                  %{fmtNum(v, 1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm">Fiyatı kim söylüyor? (oracle)</div>
            <Seg
              value={st.feedback}
              onChange={(v) => set({ feedback: v })}
              options={[
                { v: 0, label: "Dış fiyat (Chainlink / kur)", hint: "gerçekçi · Aave böyle çalışır" },
                { v: 10_000, label: "Anlık havuz fiyatı", hint: "en kötü durum · manipülasyona açık" },
              ]}
            />
          </div>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm text-muted">Gelişmiş ayarlar</summary>
            <div className="mt-4 space-y-5">
              <div>
                <div className="mb-2 text-sm">Teminat varlığı</div>
                <Seg
                  value={st.assetId}
                  onChange={(v) => set({ assetId: v })}
                  options={UI_ASSETS.map((a) => ({
                    v: a.id,
                    label: sym(a),
                    hint: `${fmtUsd(a.collateralUsd)} · LT %${a.ltBps / 100}`,
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>Süre</span>
                    <span className="num font-mono">{st.steps} blok</span>
                  </div>
                  <input type="range" min={1} max={100} value={st.steps} onChange={(e) => set({ steps: +e.target.value })} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span title="Her blokta likidatörlerin kaç tur satış yaptığı">Dalga/blok</span>
                    <span className="num font-mono">{st.rounds}</span>
                  </div>
                  <input type="range" min={1} max={20} value={st.rounds} onChange={(e) => set({ rounds: +e.target.value })} />
                </div>
              </div>
              {canCalibrate && (
                <div>
                  <div className="mb-2 text-sm">Defter</div>
                  <Seg
                    value={useCal ? "cal" : "real"}
                    onChange={(v) => set({ calibrated: v === "cal" })}
                    options={[
                      { v: "real", label: `Gerçek (${asset.realPositions})`, hint: "Aave'deki pozisyonlar" },
                      { v: "cal", label: `Kalibre (${fmtNum(asset.calibratedPositions)})`, hint: "gerçek dağılımdan örnek" },
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
                        max={resOptions.length - 1}
                        value={Math.max(0, resOptions.indexOf(maxRes))}
                        onChange={(e) => set({ resolution: resOptions[+e.target.value] })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
          <div className="rounded-lg bg-panel-2 p-3 text-xs text-muted">
            Satışların gittiği havuz: <b className="text-text">{fmtUsd(asset.depthUsd)}</b>{" "}
            {asset.depthIsAssumption ? (
              <span className="rounded bg-warn/20 px-1 text-warn">varsayım</span>
            ) : (
              <span className="rounded bg-good/20 px-1 text-good">ölçüldü</span>
            )}
            <div className="mt-1">{asset.depthNote}</div>
            {!useCal && (
              <div className="mt-1">
                Bloklar arası arbitraj toparlanması:{" "}
                <b className="text-text">%{fmtNum((RECOVERY_BPS[st.assetId]?.bps ?? 0) / 100)}</b>{" "}
                <span className="rounded bg-warn/20 px-1 text-warn">varsayım</span> ·{" "}
                {RECOVERY_BPS[st.assetId]?.why ?? "toparlanma yok"}
              </div>
            )}
            {st.assetId === 12 && <div className="mt-1">PT-AUSD 8 Ekim 2026'da vadesine eriyor; fiyatı 1'e yakınsıyor.</div>}
            {isEth && <div className="mt-1">Pozisyonlar Ethereum Aave'den okundu; simülasyon Monad'da çalışır.</div>}
          </div>
          <button
            onClick={simulate}
            disabled={!r || sending || !!error}
            className="w-full rounded-lg bg-accent px-4 py-3 text-lg font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {sending ? "Gönderiliyor…" : "Zincirde kanıtla"}
          </button>
          <CostTag gasLimit={r ? gasLimit : null} />
          <div className="text-xs text-muted">
            Ekrandaki sonuç ücretsiz önizleme (eth_call). Bu buton aynı hesabı Monad'da bir tx olarak çalıştırır; herkes
            doğrulayabilir. Monad gas'ı kullanılan miktardan değil limitten keser, bu yüzden maliyet göndermeden önce bellidir.
            {burner && (
              <>
                {" "}
                Geçici cüzdan:{" "}
                <a className="underline" href={addrUrl(burner)} target="_blank" rel="noreferrer">
                  {shortAddr(burner)}
                </a>
                .
              </>
            )}
          </div>
        </section>

        {/* results */}
        <section className="space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="text-sm uppercase tracking-wider text-muted">Karşılıksız kalan borç</div>
                  <div className="num text-6xl font-black leading-none text-bad md:text-7xl">
                    {r ? usd(r.badDebt, scale) : "…"}
                  </div>
                  {r && (
                    <div className="mt-2 text-sm text-muted">
                      borcun {fmtPct(wadToNum(r.badDebt) / Math.max(1, wadToNum(r.totalDebt)))}'i · kimse ödemeyecek
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-sm uppercase tracking-wider text-muted">Likide edilemeyen borç</div>
                  <div className="num text-6xl font-black leading-none text-warn md:text-7xl">
                    {r ? usd(r.stuckDebt, scale) : "…"}
                  </div>
                  {r && (
                    <div className="mt-2 text-sm text-muted">
                      borcun {fmtPct(wadToNum(r.stuckDebt) / Math.max(1, wadToNum(r.totalDebt)))}'i · bekleyen bomba
                      {useCal && " · tam deftere ölçeklendi"}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-muted">
                {loading ? "hesaplanıyor…" : r ? `önizleme ${Math.round(ms)} ms` : ""}
                <div>
                  {useCal ? "Kalibre veri (gerçek toplamlar)" : isEth ? "Ethereum Aave pozisyonları" : "Gerçek Aave pozisyonları"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              <b className="text-bad">Karşılıksız:</b> teminatı borcunun altına düşmüş, hepsi satılsa bile kapanmayan açık;
              sonunda mevduat sahipleri öder. <b className="text-warn">Likide edilemeyen:</b> pozisyon eşiğin altında ama
              havuz o kadar sığ ki likidatör satarsa zarar eder; kimse dokunmuyor, fiyat biraz daha düşerse karşılıksız
              kalır.
            </p>
            {error && <div className="mt-3 rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">{error}</div>}
            {r && (
              <>
                <div className="mt-4 rounded-lg border border-line bg-panel-2 p-4 text-sm leading-relaxed">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Ne oldu?</div>
                  {narrate(r, asset, st, scale)}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat
                    label="likide edilen borç"
                    hint="Likidatörlerin ödeyip kapattığı borç"
                    value={usd(r.totalLiquidated, scale)}
                  />
                  <Stat label="toplam borç" value={usd(r.totalDebt, scale)} />
                  <Stat label={`satış dalgası · ${fmtNum(r.liquidations)} likidasyon`} value={fmtNum(r.rounds)} />
                  <Stat
                    label={`son fiyat (başta $${wadToNum(r.startPrice).toFixed(3)})`}
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

      <MonteCarlo
        base={{
          assetId: st.assetId,
          shockBps: scenario.shockBps,
          steps: st.steps,
          maxRoundsPerStep: st.rounds,
          maxPositions: asset.realPositions,
          oracleFeedbackBps: st.feedback,
        }}
        symbol={sym(asset)}
      />

      <ComparePanel shockBps={scenario.shockBps} feedback={st.feedback} steps={st.steps} rounds={st.rounds} />

      <div className="grid gap-6 lg:grid-cols-2">
        <GuardPanel />
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Stres eğrisi: {sym(asset)}</h3>
            <span className="text-xs text-muted">her düşüş için karşılıksız borç · tek eth_call</span>
          </div>
          {curve ? (
            <CurveChart shocks={CURVE_SHOCKS} market={curve.market} rate={curve.rate} />
          ) : (
            <div className="py-16 text-center text-muted">hesaplanıyor…</div>
          )}
          <p className="mt-2 text-xs text-muted">
            Yeşil: gerçekçi durum, oracle dış fiyatı (Chainlink / kur) izler; zarar ancak şok teminatı borcun altına itince
            başlar. Kırmızı: en kötü durum, oracle anlık havuz fiyatını izler; satışlar fiyatı düşürür, düşen fiyat yeni
            likidasyon tetikler (sarmal).
          </p>
        </div>
      </div>
    </div>
  );
}
