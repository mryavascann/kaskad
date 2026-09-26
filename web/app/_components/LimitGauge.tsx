"use client";

import {
  ETH_COLD_SLOAD,
  ETH_TX_GAS_CAP,
  MONAD_MEMORY_LIMIT,
  MONAD_PAGE_SLOTS,
  MONAD_TX_GAS_LIMIT,
  ethMemoryGas,
  monadMemoryGas,
} from "@/lib/kaskad/math";
import { fmtBytes, fmtGas, fmtNum } from "@/lib/kaskad/format";
import type { Result } from "./useKaskad";
import { Details } from "@/components/ui/disclosure";
import { CheckCircle2, XCircle } from "lucide-react";

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-panel-2">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Rough Ethereum cost of the same run: cold SLOAD per slot instead of MIP-8 pages, quadratic memory. */
export function ethEstimate(r: Result): number {
  const n = r.positionsUsed;
  const mem = Number(r.memoryBytes);
  const monadSload = n * 100 + Math.ceil(n / MONAD_PAGE_SLOTS) * 8_000;
  return Number(r.gasUsed) - monadSload + n * ETH_COLD_SLOAD + ethMemoryGas(mem) - monadMemoryGas(mem);
}

export function LimitGauge({ r }: { r: Result }) {
  const gas = Number(r.gasUsed);
  const mem = Number(r.memoryBytes);
  const eth = ethEstimate(r);
  const fitsEth = eth <= ETH_TX_GAS_CAP;
  return (
    <div className="card p-6">
      <div className="why-grid">
        <div className="chain-card monad"><div className="chain-title"><span>Monad</span><span className={`badge ${gas <= MONAD_TX_GAS_LIMIT ? "text-good" : "text-bad"}`}>{gas <= MONAD_TX_GAS_LIMIT ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{gas <= MONAD_TX_GAS_LIMIT ? "Tek işleme sığar" : "Sınır aşıldı"}</span></div><div className="chain-gas num">{fmtGas(gas)} <small>/ 30M gas</small></div><Bar value={gas} max={MONAD_TX_GAS_LIMIT} color="var(--accent)" /><div className="chain-detail"><span>İşlem kapasitesi</span><span>%{fmtNum(gas/MONAD_TX_GAS_LIMIT*100,1)}</span></div><div className="chain-detail"><span>Bellek</span><span>{fmtBytes(mem)} / 8 MB</span></div><div className="mt-3"><Bar value={mem} max={MONAD_MEMORY_LIMIT} color="var(--good)" /></div></div>
        <div className="chain-card"><div className="chain-title"><span>Ethereum</span><span className={`badge ${fitsEth ? "text-good" : "text-bad"}`}>{fitsEth ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{fitsEth ? "Tek işleme sığar" : "Tek işleme sığmaz"}</span></div><div className="chain-gas num">{fmtGas(eth)} <small>/ 16,78M gas</small></div><Bar value={eth} max={ETH_TX_GAS_CAP} color={fitsEth ? "var(--warn)" : "var(--bad)"} /><div className="chain-detail"><span>Monad'a göre gas</span><span className="text-warn">{fmtNum(eth/Math.max(1,gas),1)} kat</span></div><div className="chain-detail"><span>EIP-7825 işlem tavanı</span><span>{fmtNum(ETH_TX_GAS_CAP)}</span></div><div className="chain-detail"><span>Tahmini hesap</span><span className="text-muted">ethEstimate</span></div></div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center"><div><div className="num text-xl">{fmtNum(r.positionsUsed)}</div><div className="mt-1 text-[10px] text-muted">pozisyon</div></div><div><div className="num text-xl">{fmtGas(monadMemoryGas(mem))}</div><div className="mt-1 text-[10px] text-muted">Monad bellek gas'ı</div></div><div><div className="num text-xl">{fmtGas(ethMemoryGas(mem))}</div><div className="mt-1 text-[10px] text-muted">Ethereum bellek gas'ı</div></div></div>
      <Details>Monad: gasleft() farkı ve bellek tavanı motor içinde ölçülür. Ethereum tahmini: slot başına 2.100 soğuk SLOAD ve karesel bellek; fork ölçümüyle ±%1 doğrulandı. Monad bellek maliyeti w/2; Ethereum 3w + w²/512. MIP-8: 128 slotluk sayfa, ilk erişim 8.100 gas; sonrası 100 gas. Defter ve simülasyon tek kontratta, harici çağrı yok. Kontrat boyutu sınırı Monad'da 128 KB, Ethereum'da 24 KB.</Details>
    </div>
  );
}