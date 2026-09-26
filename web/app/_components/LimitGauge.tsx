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
    <div className="card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Sınır Göstergesi</h3>
        <span className="text-xs text-muted">motor içinden ölçülür: gasleft() farkı, bellek tavanı</span>
      </div>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Gas (Monad tx limiti 30M)</span>
            <span className="num font-mono">
              {fmtGas(gas)} / 30M · %{fmtNum((gas / MONAD_TX_GAS_LIMIT) * 100, 1)}
            </span>
          </div>
          <Bar value={gas} max={MONAD_TX_GAS_LIMIT} color="var(--accent)" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Bellek (tx başına 8 MB)</span>
            <span className="num font-mono">
              {fmtBytes(mem)} / 8 MB · %{fmtNum((mem / MONAD_MEMORY_LIMIT) * 100, 1)}
            </span>
          </div>
          <Bar value={mem} max={MONAD_MEMORY_LIMIT} color="var(--good)" />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-panel-2 p-3">
            <div className="num text-2xl font-bold">{fmtNum(r.positionsUsed)}</div>
            <div className="text-xs text-muted">pozisyon bellekte</div>
          </div>
          <div className="rounded-lg bg-panel-2 p-3">
            <div className="num text-2xl font-bold">{fmtGas(monadMemoryGas(mem))}</div>
            <div className="text-xs text-muted">Monad bellek gas'ı (w/2)</div>
          </div>
          <div className="rounded-lg bg-panel-2 p-3">
            <div className="num text-2xl font-bold">{fmtGas(ethMemoryGas(mem))}</div>
            <div className="text-xs text-muted">Ethereum'da aynı bellek (3w + w²/512)</div>
          </div>
        </div>
        <div className={`rounded-lg border p-3 text-sm ${fitsEth ? "border-line" : "border-bad/60 bg-bad/10"}`}>
          <b>Ethereum'da bu simülasyon:</b> ≈ <span className="num font-mono">{fmtGas(eth)}</span> gas (soğuk SLOAD
          2.100/slot + karesel bellek).{" "}
          {fitsEth ? (
            <>Tx tavanına (16,77M, EIP-7825) sığar.</>
          ) : (
            <span className="font-semibold text-bad">
              Tx tavanının {fmtNum(eth / ETH_TX_GAS_CAP, 1)} katı → tek tx'e sığmaz.
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          Tüm motor tek kontratta: defter + simülasyon (Kaskad.sol), harici çağrı yok. Monad'da kontrat limiti 128 KB
          (Ethereum 24 KB). Pozisyonlar ardışık slotlarda: MIP-8 ile 128 slotluk sayfa ilk erişimde 8.100, sonrası 100 gas.
        </p>
      </div>
    </div>
  );
}
