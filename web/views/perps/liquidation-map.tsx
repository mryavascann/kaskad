/**
 * Liquidation map (static SVG, no client code of its own): notional liquidated per 1 % of price
 * movement from the mark, longs left of zero, shorts right. Exact figures in the DataTable below.
 */
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { perpsMessages } from "@/i18n/messages/perps";
import type { HeatBin } from "@/lib/chain/perpl-model";
import { DataTable } from "@/viz/data-table";

const W = 720;
const H = 240;
const PAD = { l: 64, r: 12, t: 12, b: 28 };
const LABEL = "fill-current font-mono text-[13px]";

export function LiquidationMap({ bins, symbol, locale }: { bins: HeatBin[]; symbol: string; locale: Locale }) {
  const t = perpsMessages[locale].heat;
  const fmt = formatters(locale);
  const max = Math.max(1, ...bins.map((b) => b.notional));
  const bw = (W - PAD.l - PAD.r) / bins.length;
  const x = (i: number) => PAD.l + i * bw;
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const zero = bins.findIndex((b) => b.movePct === 0);
  const ticks = bins.map((b, i) => ({ b, i })).filter(({ b }) => b.movePct % 10 === 0);

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.chart({ symbol })} className="w-full text-fg-3">
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-line" />
        <text x={PAD.l - 8} y={PAD.t + 10} textAnchor="end" className={LABEL}>
          {fmt.usd(max)}
        </text>
        {bins.map((b, i) =>
          b.notional > 0 ? (
            <rect key={b.movePct} x={x(i) + 1} width={Math.max(1, bw - 2)} y={y(b.notional)} height={H - PAD.b - y(b.notional)} className={b.movePct < 0 ? "fill-liq" : "fill-warn"} />
          ) : null,
        )}
        {zero >= 0 && <line x1={x(zero)} x2={x(zero)} y1={PAD.t} y2={H - PAD.b} className="stroke-fg-1" strokeDasharray="3 3" />}
        {ticks.map(({ b, i }) => (
          <text key={b.movePct} x={x(i)} y={H - 8} textAnchor="middle" className={LABEL}>
            {b.movePct === 0 ? "0" : b.movePct > 0 ? `+${fmt.pct(b.movePct / 100, 0)}` : fmt.drop(-b.movePct / 100, 0)}
          </text>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-fg-3">
        <span>{t.chart({ symbol })}</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 bg-liq" />
          {t.longs}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 bg-warn" />
          {t.shorts}
        </span>
      </figcaption>
      <DataTable
        summary={t.table.summary}
        caption={t.chart({ symbol })}
        rowKey={(r) => r.movePct}
        rows={bins.filter((b) => b.positions > 0)}
        columns={[
          { label: t.table.move, cell: (r) => (r.movePct < 0 ? fmt.drop(-r.movePct / 100, 0) : `+${fmt.pct(r.movePct / 100, 0)}`) },
          { label: t.table.price, numeric: true, cell: (r) => `${fmt.num(r.from, r.from < 10 ? 4 : 2)} – ${fmt.num(r.to, r.to < 10 ? 4 : 2)}` },
          { label: t.table.positions, numeric: true, cell: (r) => fmt.int(r.positions) },
          { label: t.table.notional, numeric: true, cell: (r) => fmt.usdFull(Math.round(r.notional)) },
        ]}
      />
    </figure>
  );
}
