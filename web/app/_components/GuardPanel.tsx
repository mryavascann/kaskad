"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, type Address } from "viem";
import { guardAbi, mockMarketAbi } from "@/lib/kaskad/abi";
import { publicClient } from "@/lib/kaskad/burner";
import { sendTx, signerStore } from "@/lib/kaskad/signer";
import { DEPLOYMENT, txUrl } from "@/lib/kaskad/config";
import { simulateGasLimit } from "@/lib/kaskad/math";
import { fmtPct } from "@/lib/kaskad/format";
import { previewScenario, type Scenario } from "./useKaskad";
import { confirmCost, CostTag } from "./CostTag";
import { Details } from "@/components/ui/disclosure";
import { TransactionFeedback } from "@/components/ui/feedback";

type MarketState = { paused: boolean; maxLtvBps: number; borrowed: bigint };
const BORROW_GAS = 80_000n;

async function readMarket(address: Address): Promise<MarketState> {
  // plain reads (JSON-RPC batched by the transport); works without Multicall3 too
  const [paused, ltv, borrowed] = await Promise.all([
    publicClient.readContract({ address, abi: mockMarketAbi, functionName: "borrowPaused" }),
    publicClient.readContract({ address, abi: mockMarketAbi, functionName: "maxLtvBps" }),
    publicClient.readContract({ address, abi: mockMarketAbi, functionName: "totalBorrowed" }),
  ]);
  return { paused, maxLtvBps: Number(ltv), borrowed };
}

function Market({
  title,
  subtitle,
  s,
  onBorrow,
  busy,
  msg,
  borrowGas,
}: {
  borrowGas: bigint;
  title: string;
  subtitle: string;
  s: MarketState | null;
  onBorrow: () => void;
  busy: boolean;
  msg: string | null;
}) {
  const paused = s?.paused;
  return (
    <div className={`rounded-xl border p-4 ${paused ? "border-bad bg-bad/10" : "border-line bg-panel-2"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted">{subtitle}</div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${paused ? "bg-bad text-white" : "bg-good/20 text-good"}`}
        >
          {s == null ? "…" : paused ? "BORÇ DURDURULDU" : "BORÇ AÇIK"}
        </span>
      </div>
      <div className="mt-3 text-sm text-muted">
        Maks. LTV: <span className="num font-mono text-text">{s ? fmtPct(s.maxLtvBps / 10_000, 0) : "…"}</span>
      </div>
      <button
        onClick={onBorrow}
        disabled={busy}
        className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
      >
        Borç almayı dene
      </button>
      <CostTag gasLimit={borrowGas} />
      {msg && <div className="mt-2 text-xs">{msg}</div>}
    </div>
  );
}

export function GuardPanel() {
  const { marketA, marketB, guard, kaskad } = DEPLOYMENT.contracts;
  const [a, setA] = useState<MarketState | null>(null);
  const [b, setB] = useState<MarketState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tripTx, setTripTx] = useState<string | null>(null);
  const [msgA, setMsgA] = useState<string | null>(null);
  const [msgB, setMsgB] = useState<string | null>(null);
  const [guardGas, setGuardGas] = useState<bigint | null>(null);

  // the Guard's own scenario decides what refresh() costs: preview it once (free)
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sc = (await publicClient.readContract({ address: guard, abi: guardAbi, functionName: "scenario" })) as Scenario;
        const p = await previewScenario(sc);
        if (live) setGuardGas(simulateGasLimit(p.gasUsed, p.rounds) + 150_000n);
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, [guard]);

  const refresh = useCallback(async () => {
    try {
      const [x, y] = await Promise.all([readMarket(marketA), readMarket(marketB)]);
      setA(x);
      setB(y);
    } catch {}
  }, [marketA, marketB]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 6_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  async function runGuard() {
    setBusy(true);
    setTripTx(null);
    try {
      setStatus("Guard senaryosu önizleniyor…");
      const sc = (await publicClient.readContract({ address: guard, abi: guardAbi, functionName: "scenario" })) as Scenario;
      const p = await previewScenario(sc);
      const gas = simulateGasLimit(p.gasUsed, p.rounds) + 150_000n;
      if (!confirmCost(gas)) return;
      const { receipt, ms } = await sendTx(guard, encodeFunctionData({ abi: guardAbi, functionName: "refresh" }), gas, setStatus);
      setTripTx(receipt.transactionHash);
      setStatus(receipt.status === "success" ? `Guard çalıştı (${Math.round(ms)} ms).` : "Guard tx'i revert etti.");
      await refresh();
    } catch (e) {
      setStatus(`Hata: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setBusy(false);
    }
  }

  async function borrow(market: Address, set: (m: string) => void) {
    setBusy(true);
    try {
      await publicClient.simulateContract({
        account: signerStore.get().address ?? undefined,
        address: market,
        abi: mockMarketAbi,
        functionName: "borrow",
        args: [1_000n * 10n ** 18n],
      });
      const { receipt } = await sendTx(
        market,
        encodeFunctionData({ abi: mockMarketAbi, functionName: "borrow", args: [1_000n * 10n ** 18n] }),
        BORROW_GAS,
        set,
      );
      set(receipt.status === "success" ? "✓ 1.000 birim borç verildi." : "Tx revert etti.");
      await refresh();
    } catch (e) {
      const m = String((e as Error).message);
      set(/BorrowIsPaused/.test(m) ? "✗ Revert: BorrowIsPaused (Guard durdurdu)" : `Hata: ${m.slice(0, 100)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Guard: zincir üstü devre kesici</h3>
        <span className="text-xs text-muted">
          syrupUSDC −%3 · en kötü durum · eşik %0,5
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Market
          title="Piyasa A"
          subtitle="korumasız"
          s={a}
          busy={busy}
          msg={msgA}
          onBorrow={() => borrow(marketA, setMsgA)}
          borrowGas={BORROW_GAS}
        />
        <Market
          title="Piyasa B"
          subtitle="Kaskad Guard'lı"
          s={b}
          busy={busy}
          msg={msgB}
          onBorrow={() => borrow(marketB, setMsgB)}
          borrowGas={BORROW_GAS}
        />
      </div>
      <button
        onClick={runGuard}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        Guard'ı çalıştır
      </button>
      <CostTag gasLimit={guardGas} /><TransactionFeedback message={status} /><TransactionFeedback message={msgA} /><TransactionFeedback message={msgB} />
      {status && (
        <div className="mt-2 text-sm text-muted">
          {status}{" "}
          {tripTx && (
            <a className="text-accent underline" href={txUrl(tripTx)} target="_blank" rel="noreferrer">
              tx ↗
            </a>
          )}
        </div>
      )}
      <Details>
        Herkes Guard.refresh() çağırabilir: Guard, Kaskad motorunda ({kaskad.slice(0, 8)}…) senaryoyu çalıştırır; karşılıksız
        borç eşiği aşarsa Piyasa B'de borcu durdurur ve maks. LTV'yi %70'e düşürür.
      </Details>
    </div>
  );
}
