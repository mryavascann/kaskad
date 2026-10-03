"use client";

import { useMemo, useState, useEffect } from "react";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/design/ui/panel";
import { Readout, ReadoutRow } from "@/design/ui/readout";
import { Segmented } from "@/design/ui/segmented";
import { Skeleton } from "@/design/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { perpsMessages } from "@/i18n/messages/perps";
import { usePerplMarket } from "@/lib/chain/hooks/usePerplMarket";
import { adlThreshold, bookExhaustion, bookMid, heatmap, LIQ_BAND, liquidationPrice, stress, STRESS_MOVES, type PerpMarket } from "@/lib/chain/perpl-model";
import { PERPL_MARKETS, type PerplSymbol } from "@/lib/kaskad/perpl";
import { cn } from "@/lib/utils";
import { LiquidationMap } from "./liquidation-map";

/** Everything the panel shows for one read of a market (pure; recomputed per read). */
export function analyse(m: PerpMarket) {
  const mid = bookMid(m);
  const within = (side: "bid" | "ask") =>
    (side === "bid" ? m.bids : m.asks).filter((l) => (side === "bid" ? 1 - l.price / mid : l.price / mid - 1) <= LIQ_BAND).reduce((s, l) => s + l.price * l.size, 0);
  return {
    heat: heatmap(m),
    near: m.positions.filter((p) => Math.abs(liquidationPrice(p, m.mmf) / m.mark - 1) < 0.05).length,
    depth: { bids: within("bid"), asks: within("ask") },
    rows: STRESS_MOVES.map((mv) => stress(m, mv)),
    book: bookExhaustion(m),
    adl: adlThreshold(m),
  };
}

function useSecondsSince(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return at === null ? null : Math.max(0, Math.round((now - at) / 1_000));
}

export function PerpsPanel({ locale }: { locale: Locale }) {
  const t = perpsMessages[locale];
  const fmt = formatters(locale);
  const [symbol, setSymbol] = useState<PerplSymbol>("BTC");
  const { market, error, readAt } = usePerplMarket(symbol);
  const a = useMemo(() => (market ? analyse(market) : null), [market]);
  const seconds = useSecondsSince(readAt);
  const move = (mv: number) => (mv < 0 ? fmt.drop(-mv / 100, 0) : `+${fmt.pct(mv / 100, 0)}`);
  const price = (p: number) => `$${fmt.num(p, p < 10 ? 5 : 2)}`;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Label>{t.market}</Label>
        <Segmented<PerplSymbol>
          aria-label={t.market}
          value={symbol}
          onValueChange={setSymbol}
          options={PERPL_MARKETS.map((m) => ({ value: m.symbol, label: m.symbol }))}
        />
      </div>

      {error ? (
        <Callout tone="liq" title={t.live.error} />
      ) : (
        <Panel>
          <PanelHeader
            title={symbol}
            actions={
              <span className="font-mono text-caption text-fg-3" aria-live="polite">
                {market && seconds !== null ? t.live.updated({ seconds: fmt.int(seconds), block: fmt.block(market.block) }) : t.live.reading}
              </span>
            }
          />
          <PanelBody>
            <Readout>
              <ReadoutRow label={t.live.mark} value={market ? price(market.mark) : null} emphasis />
              <ReadoutRow label={t.live.oracle} value={market ? price(market.oracle) : null} />
              <ReadoutRow
                label={t.live.oi}
                value={market ? t.live.oiValue({ long: fmt.usd(market.oiLong * market.mark), short: fmt.usd(market.oiShort * market.mark) }) : null}
              />
              <ReadoutRow label={t.live.insurance} value={market ? fmt.usd(market.insurance) : null} />
              <ReadoutRow
                label={t.live.positions}
                value={market && a ? `${fmt.int(market.positions.length)} · ${t.live.near({ n: fmt.int(a.near) })}` : null}
                tone={a && a.near > 0 ? "warn" : undefined}
              />
            </Readout>
          </PanelBody>
        </Panel>
      )}

      <section aria-labelledby="perps-heat" className="flex flex-col gap-4">
        <h2 id="perps-heat" className="text-title-2 text-fg-1">
          {t.heat.title}
        </h2>
        <p className="max-w-doc text-body text-fg-2">{t.heat.lead}</p>
        <Panel className="p-5">
          {market && a ? (
            <>
              <LiquidationMap bins={a.heat.bins} symbol={market.symbol} locale={locale} />
              {a.heat.beyond.positions > 0 && <p className="mt-3 text-caption text-fg-3">{t.heat.beyond({ n: fmt.int(a.heat.beyond.positions), usd: fmt.usd(a.heat.beyond.notional) })}</p>}
            </>
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </Panel>
      </section>

      <section aria-labelledby="perps-verdict" className="flex flex-col gap-4">
        <h2 id="perps-verdict" className="text-title-2 text-fg-1">
          {t.verdict.title}
        </h2>
        {market && a ? (
          <ul className="flex max-w-doc list-disc flex-col gap-2 pl-5 text-body text-fg-2">
            <li>{t.verdict.depth({ bids: fmt.usd(a.depth.bids), asks: fmt.usd(a.depth.asks) })}</li>
            {a.book.down !== null && <li className="text-fg-1">{t.verdict.bookDown({ move: move(a.book.down) })}</li>}
            {a.book.up !== null && <li className="text-fg-1">{t.verdict.bookUp({ move: move(a.book.up) })}</li>}
            {a.book.down === null && a.book.up === null && <li>{t.verdict.bookHolds}</li>}
            <li className={cn(a.adl.down !== null || a.adl.up !== null ? "text-liq-hi" : "text-safe")}>
              {a.adl.down === null && a.adl.up === null
                ? t.verdict.adlNone({ fund: fmt.usd(market.insurance) })
                : t.verdict.adlAt({ fund: fmt.usd(market.insurance), move: move((a.adl.down ?? -Infinity) > -(a.adl.up ?? Infinity) ? a.adl.down! : a.adl.up!) })}
            </li>
          </ul>
        ) : (
          <Skeleton className="h-20 w-full max-w-doc" />
        )}
      </section>

      <section aria-labelledby="perps-stress" className="flex flex-col gap-4">
        <h2 id="perps-stress" className="text-title-2 text-fg-1">
          {t.stress.title}
        </h2>
        <p className="max-w-doc text-body text-fg-2">{t.stress.lead}</p>
        <Panel className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                {[t.stress.move, t.stress.positions, t.stress.notional, t.stress.absorbed, t.stress.backstop, t.stress.deficit, t.stress.fund].map((h, i) => (
                  <th key={h} scope="col" className={cn("label-mono px-4 py-3 font-normal whitespace-nowrap text-fg-3", i === 0 ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {a && market
                ? a.rows.map((r) => (
                    <tr key={r.movePct} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal text-fg-1">
                        {move(r.movePct)}
                      </th>
                      <td className="px-4 py-2.5 text-right text-fg-2">{fmt.int(r.positions)}</td>
                      <td className="px-4 py-2.5 text-right text-fg-1">{fmt.usd(r.notional)}</td>
                      <td className="px-4 py-2.5 text-right text-fg-2">{fmt.usd(r.notional - r.unfilledNotional > 0 ? r.notional - r.unfilledNotional : 0)}</td>
                      <td className={cn("px-4 py-2.5 text-right", r.unfilledNotional > 0 ? "text-warn" : "text-fg-3")}>{fmt.usd(r.unfilledNotional)}</td>
                      <td className={cn("px-4 py-2.5 text-right", r.deficit > 0 ? "text-liq-hi" : "text-fg-3")}>{fmt.usd(r.deficit)}</td>
                      <td className={cn("px-4 py-2.5 text-right", r.adl ? "text-liq-hi" : "text-fg-2")}>{r.adl ? t.stress.adl : fmt.usd(r.insuranceAfter)}</td>
                    </tr>
                  ))
                : STRESS_MOVES.map((mv) => (
                    <tr key={mv} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal text-fg-1">
                        {move(mv)}
                      </th>
                      <td colSpan={6} className="px-4 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </Panel>
      </section>
    </div>
  );
}
