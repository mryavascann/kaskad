/**
 * The night of 10 October 2025 on one time axis (server component, static SVG): Chainlink ETH/USD as
 * a step line (the price Aave used between updates) and the debt Aave liquidated every 2 minutes as
 * bars, WETH collateral darker. The exact figures sit in the DataTable below it.
 */
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { replayMessages } from "@/i18n/messages/replay";
import type { Oct10Replay } from "@/lib/chain/oct10";
import { DataTable } from "@/viz/data-table";

const W = 720;
const H = 320;
const PAD = { l: 64, r: 16, t: 16, b: 30 };
/** Two bands on one time axis: the price on top, the liquidations below it. */
const PRICE_BOTTOM = 196;
const BARS_TOP = 214;
const LABEL = "fill-current font-mono text-[13px]";

export function NightChart({ data, locale }: { data: Oct10Replay; locale: Locale }) {
  const t = replayMessages[locale].night;
  const fmt = formatters(locale);
  const { timeline } = data;
  const t0 = Date.parse(timeline.from);
  const t1 = Date.parse(timeline.to);
  const x = (iso: string) => PAD.l + ((Date.parse(iso) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);

  const prices = timeline.price.map((p) => p.usd);
  const lo = Math.floor(Math.min(...prices) / 100) * 100;
  const hi = Math.ceil(Math.max(...prices) / 100) * 100;
  const y = (usd: number) => PAD.t + ((hi - usd) / (hi - lo)) * (PRICE_BOTTOM - PAD.t);
  // Step line: each Chainlink answer holds until the next one.
  let d = "";
  timeline.price.forEach((p, i) => {
    const px = x(p.t);
    d += i === 0 ? `M${px},${y(p.usd)}` : `H${px}V${y(p.usd)}`;
  });
  d += `H${W - PAD.r}`;

  const maxBar = Math.max(...timeline.liquidations.map((b) => b.allUsd));
  const barW = (W - PAD.l - PAD.r) / timeline.liquidations.length;
  const barY = (usd: number) => H - PAD.b - (usd / maxBar) * (H - PAD.b - BARS_TOP);
  const low = data.scenario;
  const ticks = [lo, (lo + hi) / 2, hi];
  const hours = timeline.liquidations.filter((b) => b.t.endsWith(":00:00.000Z") || b.t.endsWith(":30:00.000Z"));

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.chart} className="w-full text-fg-3">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray="2 4" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className={LABEL}>
              {fmt.usdFull(v)}
            </text>
          </g>
        ))}
        {hours.map((b) => (
          <text key={b.t} x={x(b.t)} y={H - 6} textAnchor="middle" className={LABEL}>
            {b.t.slice(11, 16)}
          </text>
        ))}
        {timeline.liquidations.map((b) =>
          b.allUsd > 0 ? (
            <g key={b.t}>
              <rect x={x(b.t) + 1} width={Math.max(1, barW - 2)} y={barY(b.allUsd)} height={H - PAD.b - barY(b.allUsd)} className="fill-liq/35" />
              {b.wethUsd > 0 && <rect x={x(b.t) + 1} width={Math.max(1, barW - 2)} y={barY(b.wethUsd)} height={H - PAD.b - barY(b.wethUsd)} className="fill-liq" />}
            </g>
          ) : null,
        )}
        <path d={d} fill="none" className="stroke-fg-1" strokeWidth={1.75} />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-line" />
        <text x={PAD.l - 8} y={BARS_TOP + 10} textAnchor="end" className={LABEL}>
          {fmt.usd(maxBar)}
        </text>
        <circle cx={x(low.lowAt)} cy={y(low.lowUsd)} r={4} className="fill-warn" />
        <text x={x(low.lowAt) + 8} y={y(low.lowUsd) + 4} className="fill-warn font-mono text-[13px]">
          {fmt.usdFull(Math.round(low.lowUsd))}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-fg-3">
        <span>{t.chart}</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 bg-fg-1" />
          {t.priceAxis}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 bg-liq" />
          {t.table.weth}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 bg-liq/35" />
          {t.table.all}
        </span>
      </figcaption>
      <DataTable
        summary={t.table.summary}
        caption={t.chart}
        rowKey={(r) => r.t}
        rows={timeline.liquidations.filter((b) => b.allUsd > 0)}
        columns={[
          { label: t.table.time, cell: (r) => r.t.slice(11, 16) },
          { label: t.table.price, numeric: true, cell: (r) => fmt.usdFull(priceAt(timeline.price, r.t)) },
          { label: t.table.all, numeric: true, cell: (r) => fmt.usdFull(r.allUsd) },
          { label: t.table.weth, numeric: true, cell: (r) => fmt.usdFull(r.wethUsd) },
        ]}
      />
    </figure>
  );
}

/** The Chainlink answer in force at `iso` (the last update at or before it). */
function priceAt(path: readonly { t: string; usd: number }[], iso: string): number {
  let p = path[0].usd;
  for (const u of path) if (Date.parse(u.t) <= Date.parse(iso)) p = u.usd;
  return Math.round(p);
}
