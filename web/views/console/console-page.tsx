import { Eyebrow, Label } from "@/design/ui/label";
import { StatusDot } from "@/design/ui/status-dot";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { marketOverview } from "@/lib/chain/deployment";
import { symbolParts } from "@/lib/chain/scenario";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { Console } from "./console";
import { consolePresets } from "./model";

/** Protocol totals from deployment.json (the Monad mainnet Aave snapshot the books come from). */
function MarketStrip({ locale }: { locale: Locale }) {
  const t = consoleMessages[locale].market;
  const fmt = formatters(locale);
  const m = marketOverview();
  const focus = m.focus ? DEPLOYMENT.assets[m.focus.assetId] : undefined;
  const cells: [string, string, string | null][] = [
    [t.supplied, fmt.usd(m.suppliedUsd), null],
    [t.debt, fmt.usd(m.debtUsd), null],
    [t.borrowers, fmt.int(m.borrowersWithDebt), null],
  ];
  if (m.focus && focus) cells.push([t.focus({ symbol: symbolParts(focus).base }), fmt.usd(m.focus.collateralUsd), t.focusCaption({ lt: fmt.pct(m.focus.ltBps / 10_000, 0) })]);

  return (
    <section aria-label={t.labelText} className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Label className="flex items-center gap-2 text-fg-2">
          <StatusDot tone="safe" />
          {t.label}
        </Label>
        <Label>{t.source({ block: fmt.block(m.source.block) })}</Label>
      </p>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line-2 bg-line">
        {cells.map(([label, value, caption]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1.5 bg-bg px-4 py-3.5">
            <dt className="label-mono text-fg-3">{label}</dt>
            <dd className="font-mono text-metric-sm text-fg-1">{value}</dd>
            {caption && <dd className="font-mono text-caption text-fg-3">{caption}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ConsolePage({ locale }: { locale: Locale }) {
  const t = consoleMessages[locale];
  // One clock for the render (PT days to maturity); the page revalidates hourly.
  const now = new Date();
  return (
    <div className="page-shell pb-20">
      <header className="grid-page gap-y-8 pt-12 pb-10 lg:pt-20">
        <div className="col-span-full lg:col-span-7">
          <Eyebrow className="motion-safe:animate-rise">{t.hero.kicker}</Eyebrow>
          <h1 className="mt-5 text-display text-fg-1 motion-safe:animate-rise motion-safe:[animation-delay:var(--beat-hero)]">{t.hero.title}</h1>
          <p className="mt-5 max-w-2xl text-lead text-fg-2 motion-safe:animate-rise motion-safe:[animation-delay:var(--beat-detail)]">{t.hero.lead}</p>
        </div>
        <div className="col-span-full self-end lg:col-span-5">
          <MarketStrip locale={locale} />
        </div>
      </header>
      <Console locale={locale} presets={consolePresets(now)} nowMs={now.getTime()} />
    </div>
  );
}
