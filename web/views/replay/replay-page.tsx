import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonArrow } from "@/design/ui/button-arrow";
import { ButtonLink } from "@/design/ui/button-link";
import { Eyebrow } from "@/design/ui/label";
import { Panel } from "@/design/ui/panel";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { replayMessages } from "@/i18n/messages/replay";
import { blockUrl, isStable, OCT10, otherCollateralUsd, undefended } from "@/lib/chain/oct10";
import { cn } from "@/lib/utils";
import { NightChart } from "./night-chart";

function Section({ id, index, title, children }: { id: string; index: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-line pt-10 pb-16">
      <Eyebrow index={String(index).padStart(2, "0")}>{title}</Eyebrow>
      <h2 id={`${id}-title`} className="mt-4 text-title-1 text-fg-1">
        {title}
      </h2>
      <div className="mt-8 flex flex-col gap-8">{children}</div>
    </section>
  );
}

const prose = "max-w-doc text-body text-fg-2";

function EtherscanLink({ block, children }: { block: number; children: ReactNode }) {
  return (
    <a href={blockUrl(block)} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 font-mono text-caption text-fg-2 hover:text-fg-1">
      {children} #{block}
      <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
    </a>
  );
}

export function ReplayPage({ locale }: { locale: Locale }) {
  const t = replayMessages[locale];
  const fmt = formatters(locale);
  const r = OCT10;
  const usd = (x: number) => fmt.usd(x);
  const drop = fmt.pct(r.scenario.shockBps / 10_000, 1);
  const u = undefended(r);
  const why = r.match.why;
  const usde = r.actual.pinned.find((p) => p.symbol === "USDe")!;
  const seizedOther = Object.keys(why.onlyActualSeized).filter((a) => a !== r.book.asset);
  const fallingAssets = seizedOther.filter((a) => !isStable(a));
  const stepped = r.stepsSensitivity.map((s) => s.liquidatedUsd);
  // 20, 50 and 100 blocks agree to within 0.1 %: the path length does not matter at this depth.
  const sameSteps = (Math.max(...stepped) - Math.min(...stepped)) / Math.max(...stepped) < 0.001;

  return (
    <div className="page-shell pb-12">
      <header className="max-w-4xl pt-16 pb-14 lg:pt-24">
        <Eyebrow>{t.hero.kicker}</Eyebrow>
        <h1 className="mt-6 text-display text-fg-1">{t.hero.title}</h1>
        <p className="mt-6 max-w-2xl text-lead text-fg-2">{t.hero.lead({ drop, total: usd(r.actual.allAave.debtUsd) })}</p>
        <p className="mt-4 max-w-2xl text-body-sm text-fg-3">{t.hero.sources}</p>
      </header>

      <Section id="night" index={1} title={t.night.title}>
        <ul className={cn(prose, "flex list-disc flex-col gap-2 pl-5")}>
          <li>
            {t.night.price({
              from: fmt.usdFull(Math.round(r.book.priceUsd)),
              to: fmt.usdFull(Math.round(r.scenario.lowUsd)),
              at: r.scenario.lowAt.slice(11, 16),
              drop,
            })}
          </li>
          <li>{t.night.liquidations({ count: fmt.int(r.actual.allAave.liquidations), total: usd(r.actual.allAave.debtUsd) })}</li>
          <li>
            {t.night.weth({
              count: fmt.int(r.actual.allWethCollateral.liquidations),
              total: usd(r.actual.allWethCollateral.debtUsd),
              share: fmt.pct(r.actual.crashShareOfWeth, 0),
            })}
          </li>
          <li>{t.night.usde({ source: usde.description, price: `$${fmt.num(usde.lowPriceUsd, 4)}`, count: fmt.int(r.actual.usde.liquidations) })}</li>
        </ul>
        <Panel className="p-5">
          <NightChart data={r} locale={locale} />
        </Panel>
      </Section>

      <Section id="compare" index={2} title={t.compare.title}>
        <p className={prose}>
          {t.compare.scenario({
            positions: fmt.int(r.book.positions),
            debt: usd(r.book.debtUsd),
            block: fmt.int(r.book.block),
            shock: drop,
            low: fmt.usdFull(Math.round(r.scenario.lowUsd)),
          })}
        </p>
        <Panel className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sr-only px-5 py-3">
                  {t.compare.head.metric}
                </th>
                <th scope="col" className="label-mono px-5 py-3 text-right font-normal text-fg-3">
                  {t.compare.head.kaskad}
                </th>
                <th scope="col" className="label-mono px-5 py-3 text-right font-normal text-fg-3">
                  {t.compare.head.aave}
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <tr className="border-b border-line">
                <th scope="row" className="px-5 py-3 text-left font-sans font-normal text-fg-2">
                  {t.compare.debt}
                </th>
                <td className="px-5 py-3 text-right text-fg-1">{usd(r.predicted.liquidatedUsd)}</td>
                <td className="px-5 py-3 text-right text-fg-1">{usd(r.actual.liquidatedUsdInBook)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-5 py-3 text-left font-sans font-normal text-fg-2">
                  {t.compare.positions}
                </th>
                <td className="px-5 py-3 text-right text-fg-1">{fmt.int(r.predicted.positions)}</td>
                <td className="px-5 py-3 text-right text-fg-1">{fmt.int(r.actual.positionsInBook)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <p className="max-w-doc text-title-3 text-fg-1">
          {t.compare.headline({
            predicted: usd(u.predictedUsd),
            actual: usd(u.actualUsd),
            diff: `${u.diff < 0 ? "−" : "+"}${fmt.pct(Math.abs(u.diff), 0)}`,
          })}
        </p>
        <div className="flex flex-col gap-3">
          <h3 className="text-title-3 text-fg-1">{t.compare.whyTitle}</h3>
          <ul className={cn(prose, "flex list-disc flex-col gap-2 pl-5")}>
            <li>{t.compare.matched({ n: fmt.int(r.match.both.positions), actual: usd(r.match.both.actualUsd), predicted: usd(r.match.both.predictedUsd) })}</li>
            <li>{t.compare.defended({ n: fmt.int(why.onlyPredicted.defended.positions), usd: usd(why.onlyPredicted.defended.predictedUsd) })}</li>
            <li>{t.compare.unliquidated({ n: fmt.int(why.onlyPredicted.unliquidated.positions), usd: usd(why.onlyPredicted.unliquidated.predictedUsd) })}</li>
            <li>{t.compare.model({ n: fmt.int(why.onlyPredicted.model.positions), usd: usd(why.onlyPredicted.model.predictedUsd) })}</li>
            <li>
              {t.compare.multiAsset({
                n: fmt.int(r.match.onlyActual.positions),
                usd: usd(r.match.onlyActual.actualUsd),
                other: usd(otherCollateralUsd(r)),
                assets: fallingAssets.join(", "),
                stables: seizedOther.some(isStable),
              })}
            </li>
            <li>{t.compare.outside({ n: fmt.int(r.actual.wethCollateralOutsideBook.liquidations), usd: usd(r.actual.wethCollateralOutsideBook.debtUsd) })}</li>
          </ul>
        </div>
      </Section>

      <Section id="curve" index={3} title={t.curve.title}>
        <p className={prose}>{t.curve.lead}</p>
        <Panel className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                {[t.curve.shock, t.curve.debt, t.curve.positions].map((h, i) => (
                  <th key={h} scope="col" className={cn("label-mono px-5 py-3 font-normal text-fg-3", i === 0 ? "text-left" : "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {r.curve.map((c) => {
                const night = c.shockBps === r.scenario.shockBps;
                return (
                  <tr key={c.shockBps} className={cn("border-b border-line last:border-0", night && "bg-elev-2")} aria-current={night ? "true" : undefined}>
                    <th scope="row" className="px-5 py-2.5 text-left font-normal text-fg-1">
                      {fmt.drop(c.shockBps / 10_000, c.shockBps % 100 === 0 ? 0 : 2)}
                      {night && <span className="ml-2 font-sans text-caption text-warn">{t.curve.thisNight}</span>}
                    </th>
                    <td className="px-5 py-2.5 text-right text-fg-1">{usd(c.liquidatedUsd)}</td>
                    <td className="px-5 py-2.5 text-right text-fg-2">{fmt.int(c.positions)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </Section>

      <Section id="assumptions" index={4} title={t.assumptions.title}>
        <ul className={cn(prose, "flex list-disc flex-col gap-2 pl-5")}>
          <li>{t.assumptions.scope({ loops: fmt.int(r.book.excludedLoops.positions), loopsDebt: usd(r.book.excludedLoops.debtUsd) })}</li>
          {sameSteps && <li>{t.assumptions.depth({ depth: usd(r.scenario.depthUsd), same: usd(r.stepsSensitivity[0].liquidatedUsd) })}</li>}
          <li>{t.assumptions.recovery}</li>
          <li>{t.assumptions.other}</li>
          <li>{t.assumptions.method}</li>
        </ul>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <EtherscanLink block={r.book.block}>{t.assumptions.bookBlock}</EtherscanLink>
          <EtherscanLink block={r.scenario.lowBlock}>{t.assumptions.lowBlock}</EtherscanLink>
        </div>
      </Section>

      <ButtonLink href={href("app", locale)} variant="primary" size="lg" className="group">
        {t.cta}
        <ButtonArrow />
      </ButtonLink>
    </div>
  );
}
