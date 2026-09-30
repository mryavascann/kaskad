"use client";
import { useSigner } from "@/components/ui/use-signer";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { getBurner, publicClient } from "@/lib/kaskad/burner";
import { addrUrl } from "@/lib/kaskad/config";
import { fmtNum, shortAddr } from "@/lib/kaskad/format";
import { connectInjected, connectMeraSigner, selectBurner, signerLabel, type SignerKind } from "@/lib/kaskad/signer";

import { Details, Help } from "@/components/ui/disclosure";
import { Zap, Wallet, Fingerprint, ArrowUpRight, ShieldCheck } from "lucide-react";

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
    <div className={`card connect-card flex flex-col gap-3 p-6 ${active ? "border-accent! bg-accent/5" : ""}`} data-kind={kind}>
      <div className="wallet-icon">{kind === "burner" ? <Zap size={23} /> : kind === "mera" ? <Fingerprint size={23} /> : <Wallet size={23} />}</div>
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
  const signer = useSigner();
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
      <section className="page-intro">
        <div className="eyebrow"><ShieldCheck size={13} /> SENİN İŞLEMİN. SENİN SEÇİMİN.</div>
        <h1>Cüzdanını bağla.</h1>
        <p>Zincirdeki işlemlerini imzalayacak cüzdanı seç.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3"><span className="badge badge-violet">Aktif · {signerLabel[signer.kind]}</span>{signer.address && <span className="font-mono text-xs text-muted">{shortAddr(signer.address)}</span>}<span className="badge"><span className="status-dot" /> Monad testnet</span></div>
      </section>
      <div className={`card flex flex-wrap items-center justify-between gap-4 p-5 ${sponsorLow ? "border-warn/30!" : ""}`}>
        <div className="flex items-center gap-3"><Zap size={18} className="text-accent" /><div><div className="text-sm">Sponsor bütçesi</div><div className="mt-1 text-xs text-muted">Geçici cüzdanın işlem ücretlerini karşılar.</div></div></div>
        <div className="flex items-center"><span className={`num text-2xl ${sponsorLow ? "text-warn" : "text-text"}`}>{mon(spendable)}</span><Help label="Harcanabilir sponsor bütçesi">10 MON rezerv hariçtir. Bütçe azalırsa kendi cüzdanınla devam edebilirsin.</Help></div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          kind="burner"
          active={signer.kind === "burner"}
          title="Geçici cüzdan (sponsorlu)"
          desc="Kurulum gerektirmez; işlem ücretini sponsor öder."
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
          desc="MetaMask, Rabby veya Phantom ile kendi MON bakiyeni kullan."
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
          desc="Passkey ile giriş yap; tohum cümlesi gerekmez."
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

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm"><ShieldCheck size={17} className="text-good" /> Önizlemeler ücretsiz; cüzdan gerektirmez.</div><a className="button-secondary" href={FAUCET} target="_blank" rel="noreferrer">Testnet MON al <ArrowUpRight size={15} /></a></div>
        <Details title="İmzalama ve ücretler">İşlem maliyeti her düğmenin altında gösterilir. Monad gas ücretini limitten keser. Tarayıcı cüzdanında işlemi kendin onaylarsın. Mera ve geçici cüzdan doğrudan imzalar; eth_sendRawTransactionSync ile receipt alır. Mera anahtarı passkey'den türetilir ve yalnızca bellekte durur. Harcamalar testnet MON cinsindendir.</Details>
      </section>
    </div>
  );
}
