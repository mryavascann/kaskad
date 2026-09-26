"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { getBurner, publicClient } from "@/lib/kaskad/burner";
import { addrUrl } from "@/lib/kaskad/config";
import { fmtNum, shortAddr } from "@/lib/kaskad/format";
import { connectInjected, connectMeraSigner, selectBurner, signerLabel, signerStore, type SignerKind } from "@/lib/kaskad/signer";

const FAUCET = "https://faucet.monad.xyz";
const mon = (w: bigint | null) => (w === null ? "…" : `${fmtNum(Number(w) / 1e18, 3)} MON`);

type Sponsor = { address: Address; balanceWei: string; spendableWei: string };

function Card({
  kind,
  active,
  title,
  desc,
  address,
  balance,
  children,
}: {
  kind: SignerKind;
  active: boolean;
  title: string;
  desc: string;
  address: Address | null;
  balance: bigint | null;
  children: React.ReactNode;
}) {
  return (
    <div className={`card flex flex-col gap-3 p-5 ${active ? "border-accent! bg-accent/5" : ""}`} data-kind={kind}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-muted">{desc}</div>
        </div>
        {active && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">AKTİF</span>}
      </div>
      {address && (
        <div className="text-sm">
          <a className="font-mono underline" href={addrUrl(address)} target="_blank" rel="noreferrer">
            {shortAddr(address)}
          </a>{" "}
          · <span className="num">{mon(balance)}</span>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Connect() {
  const signer = useSyncExternalStore(signerStore.subscribe, signerStore.get, signerStore.server);
  const [burner, setBurner] = useState<Address | null>(null);
  const [injected, setInjected] = useState<Address | null>(null);
  const [mera, setMera] = useState<Address | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const b = getBurner().address;
    setBurner(b);
    const addrs = [b, injected, mera].filter(Boolean) as Address[];
    const vals = await Promise.all(addrs.map((a) => publicClient.getBalance({ address: a }).catch(() => 0n)));
    setBalances(Object.fromEntries(addrs.map((a, i) => [a, vals[i]])));
    fetch("/api/fund")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setSponsor(s))
      .catch(() => {});
  }, [injected, mera]);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    const i = setInterval(refresh, 10_000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [refresh]);

  async function run(fn: () => Promise<Address>, set: (a: Address) => void) {
    setBusy(true);
    setMsg(null);
    try {
      set(await fn());
    } catch (e) {
      setMsg((e as Error).message.slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  const spendable = sponsor ? BigInt(sponsor.spendableWei) : null;
  const sponsorLow = spendable !== null && spendable < 3n * 10n ** 18n;
  const bal = (a: Address | null) => (a ? (balances[a] ?? null) : null);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">Cüzdan bağla</h1>
        <p className="mt-1 text-sm text-muted">
          Zincire giden her işlemi (simülasyon kanıtı, Monte Carlo, Guard, borç denemesi) hangi cüzdanın imzalayacağını
          seç. Ücretsiz önizlemeler cüzdan gerektirmez. Aktif: <b className="text-text">{signerLabel[signer.kind]}</b>
          {signer.address && <> ({shortAddr(signer.address)})</>}.
        </p>
        <div className={`mt-3 rounded-lg p-3 text-sm ${sponsorLow ? "bg-warn/15 text-warn" : "bg-panel-2 text-muted"}`}>
          Sponsor bütçesi (harcanabilir, 10 MON rezerv hariç): <b className="num">{mon(spendable)}</b>
          {sponsorLow && " · azaldı: kendi cüzdanınla devam etmen önerilir."}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          kind="burner"
          active={signer.kind === "burner"}
          title="Geçici cüzdan (sponsorlu)"
          desc="Tarayıcıda üretilen testnet anahtarı; gas'ı proje sponsoru öder. Kurulum yok."
          address={burner}
          balance={bal(burner)}
        >
          <button onClick={() => selectBurner()} className="rounded-lg border border-line px-3 py-2 text-sm hover:border-accent">
            Bunu kullan
          </button>
        </Card>

        <Card
          kind="injected"
          active={signer.kind === "injected"}
          title="Tarayıcı cüzdanı"
          desc="MetaMask, Rabby, Phantom… Monad testnet yoksa eklemeyi önerir. Gas senin MON'undan."
          address={injected}
          balance={bal(injected)}
        >
          <button
            disabled={busy}
            onClick={() => run(connectInjected, setInjected)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {injected ? "Yeniden bağlan" : "Bağlan"}
          </button>
        </Card>

        <Card
          kind="mera"
          active={signer.kind === "mera"}
          title="Mera passkey"
          desc="Category Labs'in passkey cüzdanı: tohum cümlesi yok, anahtar passkey'den türetilir ve yalnızca bellekte durur."
          address={mera}
          balance={bal(mera)}
        >
          <button
            disabled={busy}
            onClick={() => run(() => connectMeraSigner("login"), setMera)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Passkey ile giriş
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => connectMeraSigner("create"), setMera)}
            className="rounded-lg border border-line px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
          >
            Yeni passkey oluştur
          </button>
        </Card>
      </div>

      {msg && <div className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm">{msg}</div>}

      <section className="card p-5 text-sm text-muted">
        <b className="text-text">Kendi cüzdanınla:</b> testnet MON gerekir (
        <a className="text-accent underline" href={FAUCET} target="_blank" rel="noreferrer">
          faucet.monad.xyz
        </a>
        ). Her düğmenin altındaki maliyet etiketi, o işlemin cüzdanından ne kadar alacağını gösterir. Monad gas'ı limitten
        kestiği için tutar göndermeden önce bellidir. Tarayıcı cüzdanında işlemi kendin onaylarsın; Mera ve geçici cüzdan
        işlemi doğrudan imzalar ve <code>eth_sendRawTransactionSync</code> ile tek çağrıda receipt alır.
      </section>
    </div>
  );
}
