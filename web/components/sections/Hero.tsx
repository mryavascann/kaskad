"use client";

import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Terminal, Zap } from "lucide-react";
import type { Result } from "@/app/_components/useKaskad";
import { fmtNum, fmtUsd, shortAddr, wadToNum } from "@/lib/kaskad/format";
import { txUrl } from "@/lib/kaskad/config";

export function Hero({ result, ms, loading, tx }: { result: Result | null; ms: number; loading: boolean; tx: { hash: string; ms: number; sync: boolean } | null }) {
  return <section className="hero">
    <div className="hero-copy">
      <div className="eyebrow"><span className="status-dot" /> MONAD ÜZERİNDE · ZİNCİR ÜSTÜ RİSK MOTORU</div>
      <h1>Tek işlemde<br /><span>likidasyon kaskadı.</span></h1>
      <p>Aave&apos;nin gerçek borçlularını Monad&apos;da, zincirde simüle eder.</p>
      <div className="hero-actions"><a href="#senaryolar" className="button-primary">Simülasyonu başlat <ArrowUpRight size={17} /></a><Link href="/cuzdan" className="button-secondary">Param güvende mi? <ArrowUpRight size={16} /></Link></div>
      <div className="hero-note"><span><Check size={13} /> Gerçek Aave verisi</span><span><Zap size={13} /> Ücretsiz önizleme</span></div>
    </div>
    <div className="terminal-stage">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="terminal-card">
        <div className="terminal-top"><span className="flex items-center gap-2"><Terminal size={15} /> kaskad / simulate</span><span className="terminal-dots">● ● ●</span></div>
        <div className="terminal-code"><span className="text-accent">await</span> kaskad.<span className="text-text">simulate</span>({"{"}<br /><span className="pl-5">network: <span className="text-good">&quot;monad&quot;</span>,</span><br /><span className="pl-5">positions: <span className="text-warn">{result ? fmtNum(result.positionsUsed) : "…"}</span></span><br />{"}"});</div>
        <div className="terminal-output"><div className="flex justify-between"><span className="text-muted">Karşılıksız borç</span><span className="num text-bad">{result ? fmtUsd(wadToNum(result.badDebt)) : "—"}</span></div><div className="terminal-wave" aria-hidden="true">{[24,38,30,54,43,68,48,74,60,84,68,91,74,96,83,100,88,92,80,96].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div></div>
        <div className="terminal-bottom"><span className="flex items-center gap-2"><span className="status-dot" />{loading ? "Hesaplanıyor" : result ? "Önizleme hazır" : "Veri bekleniyor"}</span><span className="num">{result ? `${fmtNum(tx?.ms ?? ms)} ms` : "—"}</span></div>
        <div className="terminal-hash">{tx ? <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">tx {shortAddr(tx.hash)} ↗ · {tx.sync ? "sendRawTransactionSync" : "async"}</a> : "eth_call · zincirde kanıt bekleniyor"}</div>
      </div>
      <div className="terminal-caption"><span className="brand-mark small">▱</span> Tek işlem. Tüm kaskad.</div>
    </div>
    <a href="#senaryolar" className="hero-scroll" aria-label="Senaryolara git"><ArrowDown size={15} /></a>
  </section>;
}
