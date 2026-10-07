"use client";

import { useState, type FormEvent } from "react";
import { getAddress, isAddress } from "viem";
import { Button } from "@/design/ui/button";
import { Input, addressInputProps } from "@/design/ui/input";
import { Panel } from "@/design/ui/panel";
import { Readout, ReadoutRow } from "@/design/ui/readout";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { perplWalletMessages } from "@/i18n/messages/perpl-wallet";
import { usePerplWallet } from "@/lib/chain/hooks/usePerplWallet";
import { WALLET_SHOCKS, walletPositionRisk, walletShock, walletSummary } from "@/lib/chain/perpl-wallet-risk";

export function PerplWalletPanel({ locale }: { locale: Locale }) {
  const t = perplWalletMessages[locale];
  const fmt = formatters(locale);
  const [input, setInput] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const { data, error, loading } = usePerplWallet(address);
  const summary = data ? walletSummary(data) : null;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAddress(input.trim())) { setInvalid(true); setAddress(null); return; }
    setInvalid(false);
    setAddress(getAddress(input.trim()));
  }
  const price = (n: number) => `$${fmt.num(n, n < 10 ? 5 : 2)}`;
  const cell = "px-4 py-3 text-right whitespace-nowrap";
  return (
    <section aria-labelledby="perpl-wallet-title" className="mt-16 flex flex-col gap-6 border-t border-line pt-10">
      <h2 id="perpl-wallet-title" className="text-title-2 text-fg-1">{t.title}</h2>
      <p className="max-w-doc text-body text-fg-2">{t.lead}</p>
      <form onSubmit={submit} className="flex max-w-3xl flex-col gap-3">
        <label htmlFor="perpl-wallet-address" className="label-mono text-fg-2">{t.address}</label>
        <Input {...addressInputProps} id="perpl-wallet-address" mono value={input} placeholder="0x…" maxLength={42} invalid={invalid} aria-describedby={invalid ? "perpl-wallet-invalid perpl-wallet-privacy" : "perpl-wallet-privacy"} onChange={(event) => { setInput(event.target.value); setInvalid(false); setAddress(null); }} />
        {invalid && <p id="perpl-wallet-invalid" role="alert" className="text-body-sm text-liq-hi">{t.invalid}</p>}
        <p id="perpl-wallet-privacy" className="text-caption text-fg-3">{t.privacy}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{t.submit}</Button>
          <Button type="button" variant="secondary" onClick={() => { setInput(""); setAddress(null); setInvalid(false); }}>{t.clear}</Button>
        </div>
      </form>
      {loading && <p role="status" className="text-body text-fg-2">{t.loading}</p>}
      {error && <p role="alert" className="text-body text-warn">{data ? t.stale : t.error}</p>}
      {data && <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-body-sm text-fg-2">
          <a href={`https://monadscan.com/address/${data.address}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-fg-1 underline">{data.address}</a>
          <p>{t.block}: {fmt.block(data.block)} · {t.updated}: <time dateTime={new Date(data.readAt).toISOString()}>{new Date(data.readAt).toLocaleTimeString(fmt.tag, { timeZone: "UTC", hour12: false })} UTC</time></p>
          {data.account && <p>{t.account} #{data.account.id}{data.account.frozen ? ` · ${t.frozen}` : ""}</p>}
        </div>
        {!data.account ? <p role="status">{t.missing}</p> : <>
          <p className="max-w-doc text-body-sm text-fg-3">{t.scope}</p>
          {data.unsupportedMarkets.length > 0 && <p role="alert" className="text-warn">{t.unsupported} {data.unsupportedMarkets.join(", ")}</p>}
          <Panel className="p-5">
            <Readout>
              <ReadoutRow label={t.available} value={fmt.usd(summary!.available)} />
              <ReadoutRow label={t.locked} value={fmt.usd(data.account.locked)} />
              <ReadoutRow label={t.equity} value={fmt.usd(summary!.equity)} />
              <ReadoutRow label={t.notional} value={fmt.usd(summary!.notional)} />
              <ReadoutRow label={t.near} value={`${summary!.near} / ${data.positions.length}`} tone={summary!.near ? "warn" : undefined} />
            </Readout>
          </Panel>
          {!data.positions.length ? <p role="status">{t.empty}</p> : <>
            <h3 className="text-title-3 text-fg-1">{t.positions}</h3>
            <Panel className="overflow-x-auto">
              <table aria-label={t.positions} className="w-full text-body-sm">
                <thead><tr className="border-b border-line">{[t.market, t.side, t.size, t.value, t.positionEquity, t.liquidation, t.distance].map((label) => <th key={label} scope="col" className={`${cell} label-mono font-normal text-fg-3`}>{label}</th>)}</tr></thead>
                <tbody className="font-mono tabular-nums">{data.positions.map((p) => {
                  const risk = walletPositionRisk(p);
                  return <tr key={p.perpId} className="border-b border-line last:border-0">
                    <th scope="row" className={`${cell} font-normal`}>{p.symbol}</th>
                    <td className={cell}>{t[p.side]}</td><td className={cell}>{fmt.num(p.size, 8)}</td>
                    <td className={cell}>{fmt.usd(risk.notional)}</td><td className={cell}>{fmt.usd(risk.equity)}</td>
                    <td className={cell}>{price(risk.liquidation)}</td>
                    <td className={`${cell} ${risk.distance <= 0.05 ? "text-warn" : "text-fg-2"}`}>{risk.distance <= 0 ? t.breached : fmt.pct(risk.distance)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </Panel>
            <h3 className="text-title-3 text-fg-1">{t.stress}</h3>
            <p className="max-w-doc text-body-sm text-fg-2">{t.stressLead}</p>
            <Panel className="overflow-x-auto">
              <table aria-label={t.stress} className="w-full text-body-sm">
                <thead><tr className="border-b border-line">{[t.move, t.crossed, t.exposed].map((label) => <th key={label} scope="col" className={`${cell} label-mono font-normal text-fg-3`}>{label}</th>)}</tr></thead>
                <tbody className="font-mono tabular-nums">{WALLET_SHOCKS.map((move) => {
                  const shock = walletShock(data.positions, move);
                  return <tr key={move} className="border-b border-line last:border-0"><th scope="row" className={`${cell} font-normal`}>{move < 0 ? fmt.drop(-move / 100, 0) : `+${fmt.pct(move / 100, 0)}`}</th><td className={cell}>{shock.positions}</td><td className={cell}>{fmt.usd(shock.notional)}</td></tr>;
                })}</tbody>
              </table>
            </Panel>
          </>}
          <p className="max-w-doc text-caption text-fg-3">{t.assumptions}</p>
        </>}
      </div>}
    </section>
  );
}
