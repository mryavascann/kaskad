"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import type { UserPosition } from "@/lib/kaskad/aave";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { fmtNum, fmtPct, fmtUsd, shortAddr, wadToNum } from "@/lib/kaskad/format";
import { collateralToSurvive, depegToLiquidation, repayToSurvive } from "@/lib/kaskad/math";
import { previewScenario, type Result } from "../_components/useKaskad";

const SAMPLES = [
  { label: "En büyük syrupUSDC borçlusu", address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748" },
  { label: "En büyük PT-AUSD borçlusu", address: "0x278AA16c5C8E1D68938A302e809F126863D81dAA" },
];

/** Headline cascade for an asset: real book, -3%, market oracle (as on the protocol screen). */
async function cascadeFor(assetId: number, shockBps = 300): Promise<Result | null> {
  const a = DEPLOYMENT.assets[assetId];
  if (!a) return null;
  return previewScenario({
    assetId,
    shockBps,
    steps: 20,
    maxRoundsPerStep: 3,
    maxPositions: a.realPositions,
    oracleFeedbackBps: 0,
  }).catch(() => null);
}

export function Wallet() {
  const [input, setInput] = useState("");
  const [pos, setPos] = useState<UserPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shockPct, setShockPct] = useState(5);
  const [cascade, setCascade] = useState<Result | null>(null);
  const [headline, setHeadline] = useState<Result | null>(null);
  const [meraMsg, setMeraMsg] = useState<string | null>(null);

  useEffect(() => {
    cascadeFor(9, 2000).then(setHeadline);
  }, []);

  async function lookup(addr: string) {
    setInput(addr);
    if (!isAddress(addr, { strict: false })) return setErr("Geçerli bir adres gir.");
    setLoading(true);
    setErr(null);
    setPos(null);
    setCascade(null);
    try {
      const res = await fetch(`/api/position?address=${addr}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "okuma başarısız");
      const p = body as UserPosition;
      setPos(p);
      if (p.dominant) cascadeFor(p.dominant.id).then(setCascade);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function mera() {
    setMeraMsg("Passkey isteniyor…");
    try {
      const { connectMera } = await import("@/lib/kaskad/mera");
      const addr = await connectMera();
      setMeraMsg(`Mera cüzdanı: ${shortAddr(addr)}`);
      lookup(addr);
    } catch (e) {
      setMeraMsg(`Mera bağlanamadı: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  async function injected() {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) return setMeraMsg("Tarayıcı cüzdanı bulunamadı.");
    const [addr] = await eth.request({ method: "eth_requestAccounts" });
    if (addr) lookup(addr);
  }

  const d = pos?.dominant;
  const shock = shockPct / 100;
  const borrower = pos && pos.debtUsd > 1;
  const threshold = d && borrower ? depegToLiquidation(d.suppliedUsd, pos.otherLtAdjustedUsd, d.ltBps, pos.debtUsd) : null;
  const cascadeDrop = cascade ? 1 - wadToNum(cascade.finalPrice) / wadToNum(cascade.startPrice) : null;
  const supplied = pos ? pos.reserves.filter((r) => r.suppliedUsd > 1) : [];
  const lendSide = supplied.filter((r) => r.utilization > 0.01);
  const lendUsd = lendSide.reduce((s, r) => s + r.suppliedUsd, 0);
  const badShare = headline && pos ? (lendUsd / Math.max(1, pos.protocol.suppliedUsd)) * wadToNum(headline.badDebt) : 0;

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">Param güvende mi?</h1>
        <p className="mt-1 text-sm text-muted">
          Monad mainnet'teki Aave pozisyonunu salt okunur olarak okuruz: hangi depeg'de likide olursun, kaskad seni nasıl
          etkiler, ne yapmalısın.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && lookup(input)}
            placeholder="0x… mainnet cüzdan adresi"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          <button onClick={() => lookup(input)} className="rounded-lg bg-accent px-4 py-2 font-semibold text-white">
            {loading ? "Okunuyor…" : "Kontrol et"}
          </button>
          <button onClick={mera} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent">
            Mera ile bağlan (passkey)
          </button>
          <button onClick={injected} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent">
            Tarayıcı cüzdanı
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {SAMPLES.map((s) => (
            <button key={s.address} onClick={() => lookup(s.address)} className="rounded-full bg-panel-2 px-3 py-1 hover:text-accent">
              Örnek: {s.label} ({shortAddr(s.address)})
            </button>
          ))}
          {meraMsg && <span className="px-2 py-1 text-muted">{meraMsg}</span>}
        </div>
        {err && <div className="mt-3 text-sm text-bad">{err}</div>}
      </section>

      {pos && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card space-y-4 p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Borç tarafı</h2>
              <span className="text-xs text-muted">
                {shortAddr(pos.address)} · blok #{fmtNum(pos.block)} · E-Mode {pos.eMode || "yok"}
              </span>
            </div>
            {!borrower ? (
              <div className="text-muted">Borcun yok: likidasyon riski yok.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-panel-2 p-3">
                    <div className={`num text-3xl font-bold ${pos.hfOnchain !== null && pos.hfOnchain < 1.05 ? "text-bad" : ""}`}>
                      {pos.hfOnchain?.toFixed(3) ?? "∞"}
                    </div>
                    <div className="text-xs text-muted">sağlık faktörü (HF)</div>
                  </div>
                  <div className="rounded-lg bg-panel-2 p-3">
                    <div className="num text-xl font-bold">{fmtUsd(pos.collateralUsd)}</div>
                    <div className="text-xs text-muted">teminat</div>
                  </div>
                  <div className="rounded-lg bg-panel-2 p-3">
                    <div className="num text-xl font-bold">{fmtUsd(pos.debtUsd)}</div>
                    <div className="text-xs text-muted">borç</div>
                  </div>
                </div>
                {d && threshold !== null && (
                  <div className="rounded-xl border border-bad/50 bg-bad/10 p-4 text-lg">
                    {threshold <= 0 ? (
                      <b className="text-bad">Şu an likide edilebilirsin.</b>
                    ) : threshold >= 1 ? (
                      <>
                        {d.symbol} sıfıra düşse bile diğer teminatın borcu karşılıyor.
                      </>
                    ) : (
                      <>
                        <b>{d.symbol}</b> <b className="num text-bad">−{fmtPct(threshold, 2).replace("%", "%")}</b>'te
                        likide olursun.
                      </>
                    )}
                    <div className="mt-1 text-xs text-muted">
                      Baskın teminat {d.symbol} ({fmtUsd(d.suppliedUsd)}, LT %{d.ltBps / 100}); diğer teminatlar sabit fiyatlı
                      sayılır.
                    </div>
                  </div>
                )}
                {d && cascade && cascadeDrop !== null && threshold !== null && (
                  <div className="rounded-lg bg-panel-2 p-3 text-sm">
                    Kaskad senaryosu ({d.symbol} −%3, gerçek defter): fiyat {fmtPct(cascadeDrop)} düşüyor; protokolde{" "}
                    <b className="text-warn">{fmtUsd(wadToNum(cascade.stuckDebt))}</b> borç likide edilemiyor,{" "}
                    <b className="text-bad">{fmtUsd(wadToNum(cascade.badDebt))}</b> karşılıksız kalıyor.{" "}
                    {threshold < cascadeDrop ? (
                      <b className="text-bad">Bu senaryoda pozisyonun likide olur.</b>
                    ) : (
                      <b className="text-good">Bu senaryoda pozisyonun ayakta kalır.</b>
                    )}{" "}
                    <Link href="/" className="text-accent underline">
                      Senaryoyu aç
                    </Link>
                  </div>
                )}
                {d && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Koruma hedefi: {d.symbol} şu kadar düşse bile HF ≥ 1,05</span>
                      <span className="num font-mono font-bold">−%{shockPct}</span>
                    </div>
                    <input type="range" min={1} max={30} value={shockPct} onChange={(e) => setShockPct(+e.target.value)} />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-line p-3">
                        <div className="num text-xl font-bold text-good">
                          +{fmtUsd(collateralToSurvive(d.suppliedUsd, pos.otherLtAdjustedUsd, d.ltBps, pos.debtUsd, shock))}
                        </div>
                        <div className="text-xs text-muted">{d.symbol} teminat ekle</div>
                      </div>
                      <div className="rounded-lg border border-line p-3">
                        <div className="num text-xl font-bold text-good">
                          {fmtUsd(repayToSurvive(d.suppliedUsd, pos.otherLtAdjustedUsd, d.ltBps, pos.debtUsd, shock))}
                        </div>
                        <div className="text-xs text-muted">ya da bu kadar borç öde</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card space-y-4 p-6">
            <h2 className="font-semibold">Mevduat tarafı</h2>
            {supplied.length === 0 ? (
              <div className="text-muted">Yatırdığın varlık yok.</div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1">Varlık</th>
                      <th>Yatırılan</th>
                      <th>Havuz kullanım oranı</th>
                      <th>Çekim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplied.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-2">{r.symbol}</td>
                        <td className="num">{fmtUsd(r.suppliedUsd)}</td>
                        <td className={`num ${r.utilization > 0.9 ? "text-bad" : ""}`}>{fmtPct(r.utilization)}</td>
                        <td className="text-xs">
                          {r.utilization > 0.9 ? (
                            <span className="text-bad">riskli: likidite ~%{fmtNum((1 - r.utilization) * 100, 1)}</span>
                          ) : r.utilization > 0.01 ? (
                            <span className="text-good">çekilebilir</span>
                          ) : (
                            <span className="text-muted">teminat (borç verilmiyor)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lendUsd > 0 && headline && (
                  <div className="rounded-lg bg-panel-2 p-3 text-sm">
                    syrupUSDC −%20 kaskadında protokolde karşılıksız kalan borç{" "}
                    <b className="text-bad">{fmtUsd(wadToNum(headline.badDebt))}</b>. Borç verilen varlıklardaki payına düşen
                    yaklaşık zarar: <b className="text-bad">{fmtUsd(badShare)}</b>
                    <div className="mt-1 text-xs text-muted">
                      Yaklaşım: karşılıksız borç, borç verilen havuzlara mevduat payıyla dağıtılır (Aave'de önce Umbrella/rezervler
                      karşılar).
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted">
                  Kullanım oranı %100'e yaklaşırsa havuzda çekilecek nakit kalmaz; kaskad sırasında borçlular geri ödemediği için
                  mevduat sahipleri sıraya girer.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
