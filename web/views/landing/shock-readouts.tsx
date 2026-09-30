/**
 * The shock scene's readouts at one whole block: the wave counter, the oracle price line and the
 * replay strip. Pure markup (no hooks, no directive): the server renders them at the scene's first
 * block, and `shock-live.tsx` renders the same components per block in the browser.
 */
import type { CSSProperties } from "react";
import { Skeleton } from "@/design/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages, type LandingMessages } from "@/i18n/messages/landing";
import { cn } from "@/lib/utils";
import type { LandingFinding, LandingWave } from "./data";
import { replayAt, type ReplayBook } from "./replay";
import styles from "./shock-scene.module.css";

function waveLine(t: LandingMessages, fmt: ReturnType<typeof formatters>, w: LandingWave) {
  const v = { block: fmt.int(w.step), count: fmt.int(w.liquidations), liquidated: fmt.usd(w.liquidatedUsd) };
  return w.liquidations === 1 ? t.shock.waveLine(v) : t.shock.waveLinePlural(v);
}

export type ReadoutProps = { locale: Locale; finding: LandingFinding; book: ReplayBook | null; block: number };

/** Current wave, the wave chips, and (once the run stalls) how many positions sit under the threshold. */
export function WaveCounterView({ locale, finding, book, block }: ReadoutProps) {
  const t = landingMessages[locale];
  const fmt = formatters(locale);
  const r = replayAt(finding, book, block);
  const shown = finding.waves.slice(0, 12);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={cn("font-mono", r.latest ? "text-metric-md text-liq-hi sm:text-metric-lg" : "text-body text-fg-3")}>
          {r.latest ? t.shock.wave({ n: fmt.int(r.latest.n) }) : t.shock.noWave}
        </span>
        {r.latest && <span className="font-mono text-caption text-fg-2">{waveLine(t, fmt, r.latest)}</span>}
      </div>
      {shown.length > 1 && (
        <ol className="hidden flex-wrap gap-1.5 sm:flex" aria-label={t.hud.waves}>
          {shown.map((w) => {
            const on = w.step <= r.block;
            return (
              <li
                key={w.n}
                className={cn(
                  "rounded-tag border px-2 py-0.5 font-mono text-caption transition-colors duration-(--dur-base)",
                  on ? "border-liq/60 bg-liq/12 text-liq-hi" : "border-line-2 text-fg-3",
                )}
              >
                {t.shock.wave({ n: fmt.int(w.n) })} · {t.hud.block} {fmt.int(w.step)}
              </li>
            );
          })}
        </ol>
      )}
      {book && r.under !== null && (
        <p className={cn("text-caption text-fg-2 transition-opacity duration-(--dur-slow) sm:text-body-sm", r.stalled ? "opacity-100" : "opacity-0 motion-reduce:opacity-100")}>
          {t.shock.stalled({
            under: fmt.int(r.under),
            total: fmt.int(book.total),
          })}
        </p>
      )}
    </div>
  );
}

/** Oracle price per block, drawn up to the current block; y spans the run's own price range. */
export function PriceLineView({ locale, finding, block }: Omit<ReadoutProps, "book">) {
  const t = landingMessages[locale];
  const fmt = formatters(locale);
  const prices = finding.prices;
  const n = prices.length - 1;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const pad = 0.12;
  const y = (p: number) => Math.round((pad + (1 - pad * 2) * (1 - (p - lo) / span)) * 1000) / 1000;
  const x = (k: number) => (n > 0 ? k / n : 0);
  const points = prices.map((p, k) => `${Math.round(x(k) * 2000) / 10},${Math.round(y(p) * 600) / 10}`).join(" ");
  const k = Math.max(0, Math.min(n, block));
  const vars = { "--x": String(Math.round(x(k) * 10_000) / 10_000), "--y": String(y(prices[k])) } as CSSProperties;
  const waveSteps = new Set(finding.waves.map((w) => w.step));

  return (
    <figure className="flex flex-col gap-2" aria-label={t.shock.priceLabel}>
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="label-mono text-fg-3">{t.shock.priceLabel}</span>
        <span className="font-mono text-caption text-fg-2">
          ${fmt.num(prices[k], 4)} <span className="text-warn">{fmt.drop(1 - prices[k] / (prices[0] || 1), 1)}</span>
        </span>
      </figcaption>
      <div className="relative h-12 w-full sm:h-20" style={vars} aria-hidden>
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <line x1="0" y1="59.5" x2="200" y2="59.5" stroke="var(--color-line-2)" vectorEffect="non-scaling-stroke" />
          <polyline points={points} fill="none" stroke="var(--color-line-3)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        </svg>
        <svg viewBox="0 0 200 60" preserveAspectRatio="none" className={cn("absolute inset-0 size-full overflow-visible", styles.reveal)}>
          <polyline points={points} fill="none" stroke="var(--color-warn)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {prices.map((p, i) =>
            waveSteps.has(i) ? (
              <line key={i} x1={Math.round(x(i) * 2000) / 10} x2={Math.round(x(i) * 2000) / 10} y1="0" y2="60" stroke="var(--color-liq)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ) : null,
          )}
        </svg>
        <div className={styles.needleX}>
          <div className={styles.needleY}>
            <span className="absolute top-0 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warn shadow-glow-warn" />
          </div>
        </div>
      </div>
    </figure>
  );
}

/** The readout strip under the scene: block, oracle price, drop, waves, positions under the threshold, liquidated. */
export function ReplayStripView({ locale, finding, book, block }: Omit<ReadoutProps, "finding"> & { finding: LandingFinding | null }) {
  const t = landingMessages[locale];
  const fmt = formatters(locale);
  const r = finding ? replayAt(finding, book, block) : null;
  const items: [string, string | null, string?][] = [
    [t.hud.block, r && finding ? `${fmt.int(r.block).padStart(2, "0")}/${fmt.int(finding.steps)}` : null],
    [t.hud.price, r ? `$${fmt.num(r.price, 4)}` : null],
    [t.hud.drop, r ? fmt.drop(r.drop, 1) : null, "text-warn"],
    [t.hud.waves, r ? fmt.int(r.waves.length) : null, r && r.waves.length ? "text-liq-hi" : undefined],
    [t.hud.under, r && r.under !== null && book ? `${fmt.int(r.under)}/${fmt.int(book.total)}` : null],
    [t.hud.liquidated, r ? fmt.usd(r.liquidatedUsd) : null],
  ];
  return (
    <div className="border-t border-line-2 bg-bg/80 backdrop-blur-md">
      <dl aria-label={t.hud.label} className="page-shell grid grid-cols-3 gap-x-4 gap-y-2 py-3 sm:grid-cols-6 sm:py-4">
        {items.map(([label, value, tone]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="label-mono leading-tight text-fg-3">{label}</dt>
            <dd className={cn("font-mono text-body-sm tabular-nums text-fg-1", tone)}>
              {value ?? <Skeleton className="inline-block h-[1lh] w-12 align-middle" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
