"use client";
import { useSigner } from "@/components/ui/use-signer";

import { fmtNum } from "@/lib/kaskad/format";

import { monCost } from "@/lib/kaskad/math";
import { signerStore } from "@/lib/kaskad/signer";

export function fmtMon(gasLimit: bigint): string {
  const m = monCost(gasLimit);
  return m < 0.01 ? "<0,01 MON" : `~${fmtNum(m, m < 1 ? 2 : 2)} MON`;
}

/** Small cost line under a button: what the tx will charge (Monad charges the gas limit). */
export function CostTag({ gasLimit, free }: { gasLimit?: bigint | null; free?: boolean }) {
  const signer = useSigner();
  const payer = signer.kind === "burner" ? "sponsor öder" : "senin cüzdanından";
  if (free) return <div className="mt-1 text-center text-[11px] text-muted">ücretsiz (eth_call, zincire yazmaz)</div>;
  if (!gasLimit) return <div className="mt-1 text-center text-[11px] text-muted">maliyet hesaplanıyor…</div>;
  const heavy = monCost(gasLimit) >= 1;
  return (
    <div className={`mt-1 text-center text-[11px] ${heavy ? "text-warn" : "text-muted"}`}>
      {fmtMon(gasLimit)} · testnet, {payer}
      {heavy && " · pahalı işlem"}
    </div>
  );
}

/** Asks before spending >= 1 MON of the shared sponsor budget. */
export function confirmCost(gasLimit: bigint): boolean {
  const m = monCost(gasLimit);
  if (m < 1) return true;
  const payer = signerStore.get().kind === "burner" ? "sponsor öder" : "senin cüzdanından";
  return window.confirm(`Bu işlem ${fmtMon(gasLimit)} harcar (testnet MON, ${payer}). Devam edilsin mi?`);
}
