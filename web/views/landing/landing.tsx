import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonArrow } from "@/design/ui/button";
import { ButtonLink } from "@/design/ui/button-link";
import { Footnote } from "@/design/ui/footnote";
import { HonestyTag } from "@/design/ui/honesty";
import { Eyebrow } from "@/design/ui/label";
import { Skeleton } from "@/design/ui/skeleton";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { commonMessages } from "@/i18n/messages/common";
import { depthNote } from "@/i18n/messages/data-notes";
import { howMessages } from "@/i18n/messages/how";
import { landingMessages } from "@/i18n/messages/landing";
import { walletMessages } from "@/i18n/messages/wallet";
import { findingScenario } from "@/lib/chain/finding";
import { MARKETS } from "@/lib/chain/guard";
import { ETH_READ_GAS_PER_POSITION, MONAD_READ_GAS_PER_POSITION } from "@/lib/chain/limits";
import { PROOF_TXS } from "@/lib/chain/proofs";
import { symbolParts } from "@/lib/chain/scenario";
import { SAMPLES } from "@/lib/chain/wallet";
import { DEPLOYMENT, txUrl } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { MONAD_PAGE_SLOTS } from "@/lib/kaskad/math";
import { cn } from "@/lib/utils";
import { SmoothScroll } from "@/motion/smooth-scroll";
import { Pipeline } from "../how/diagrams";
import { HydrateOnIntent } from "./deferred";
import { FindingGap, GuardTeaser, LivePulse, MiniDial, OnchainUnlock, ScaleGauge, WalletTeaser } from "./below-fold";
import type { LandingData } from "./data";
import { GAUNTLET_AAVE_FEE_USD_PER_YEAR, GAUNTLET_FEE_SOURCE_URL, MONAD_BLOCK_TIME_MS, MONAD_FINALITY_MS } from "./facts";
import { HeroIntro, type FindingMeta } from "./hero-intro";
import { ShockScene } from "./shock-scene";
import type { WalletSample } from "./wallet-teaser";

function Section({ id, index, kicker, title, lead, children, className }: { id: string; index: number; kicker: string; title: string; lead?: ReactNode; children: ReactNode; className?: string }) {
  return (
    // content-visibility: the browser skips layout and paint of a section until it nears the viewport
    // (they all sit under the 330svh scene); `auto` keeps the size it had once rendered.
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("page-shell section-y scroll-mt-(--nav-h) [content-visibility:auto] [contain-intrinsic-size:auto_1200px]", className)}
    >
      <div className="flex max-w-3xl flex-col gap-5">
        <Eyebrow index={String(index).padStart(2, "0")}>{kicker}</Eyebrow>
        <h2 id={`${id}-title`} className="text-display text-fg-1">
          {title}
        </h2>
        {lead && <p className="max-w-2xl text-lead text-fg-2">{lead}</p>}
      </div>
      <div className="mt-12 lg:mt-16">{children}</div>
    </section>
  );
}

/** The finding's subject without the network: preset `sali` + deployment.json. */
export function findingMeta(): FindingMeta & { assetId: number } {
  const s = findingScenario();
  const asset = DEPLOYMENT.assets[String(s.assetId & 0xff)];
  return { assetId: asset.id, asset: symbolParts(asset).base, shock: s.shockBps / 10_000, bookPositions: asset.realPositions };
}

/** The sample borrowers for the wallet teaser, resolved here so its client chunk needs no viem. */
export const WALLET_SAMPLES: readonly WalletSample[] = SAMPLES.map((s) => ({ id: s.id, address: s.address, short: shortAddr(s.address), description: s.description }));

export function Landing({ locale, data }: { locale: Locale; data: LandingData }) {
  const t = landingMessages[locale];
  const c = commonMessages[locale];
  const fmt = formatters(locale);
  const { finding, positions, scale, markets } = data;
  const meta = findingMeta();
  const asset = DEPLOYMENT.assets[String(meta.assetId)];
  const depth = depthNote(asset, locale);
  const findingProof = PROOF_TXS.find((p) => p.id === "finding");
  const readRatio = ETH_READ_GAS_PER_POSITION / MONAD_READ_GAS_PER_POSITION;

  return (
    <div className="flex flex-col" data-landing="">
      <SmoothScroll />

      <ShockScene
        locale={locale}
        finding={finding}
        positions={positions}
        placeholderCount={meta.bookPositions}
        intro={<HeroIntro locale={locale} t={t} finding={finding} meta={meta} />}
      />

      {/* Below the scene: server HTML from the first paint, hydrated after the first intent. */}
      <HydrateOnIntent>
        {/* 01 · The finding */}
        <Section id="finding" index={1} kicker={t.finding.kicker} title={t.finding.title}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div className="flex flex-col gap-6">
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-2 font-mono text-metric-lg" data-landing-gap-headline="">
                {finding ? (
                  <>
                    <span className="text-fg-1">{fmt.usd(finding.clearedUsd)}</span>
                    <span className="text-title-2 text-fg-3" aria-label={t.finding.vs}>
                      ↔
                    </span>
                    <span className="text-warn">{fmt.usd(finding.stuckDebtUsd)}</span>
                  </>
                ) : (
                  <Skeleton className="h-[1lh] w-72 max-w-full" />
                )}
              </p>
              <p className="text-body text-fg-2">
                {finding ? (
                  t.finding.lead({
                    shock: fmt.drop(finding.shock, 0),
                    asset: finding.symbol,
                    cleared: fmt.usd(finding.clearedUsd),
                    stuck: fmt.usd(finding.stuckDebtUsd),
                    depth: fmt.usd(finding.poolDepthUsd),
                  })
                ) : (
                  <Skeleton className="h-24 w-full" />
                )}
              </p>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2">
                {(
                  [
                    [t.finding.under, positions ? t.finding.of({ n: fmt.int(positions.belowThreshold), total: fmt.int(positions.total) }) : null],
                    [t.finding.badDebt, finding ? fmt.usd(finding.badDebtUsd) : null],
                    [t.finding.waves, finding ? fmt.int(finding.waves.length) : null],
                    [t.finding.depth, fmt.usd(asset.depthUsd)],
                  ] as [string, string | null][]
                ).map(([label, value], i) => (
                  <div key={label} className="flex flex-col gap-1.5 bg-elev-1 p-4">
                    <dt className="label-mono text-fg-3">{label}</dt>
                    <dd className="flex flex-wrap items-center gap-2 font-mono text-body text-fg-1">
                      {value ?? <Skeleton className="h-[1lh] w-20" />}
                      {i === 3 && (
                        <HonestyTag kind={asset.depthIsAssumption ? "assumption" : "measured"}>
                          {asset.depthIsAssumption ? c.honesty.assumption : c.honesty.measured}
                        </HonestyTag>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p lang={depth.lang} className="text-caption text-fg-3">
                {depth.text}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-6 rounded-panel border border-line-2 bg-elev-1 p-5 sm:p-8">
              <FindingGap
                locale={locale}
                cleared={finding?.clearedUsd ?? null}
                stuck={finding?.stuckDebtUsd ?? null}
                copy={t.finding.gap}
                footnote={<Footnote label={t.finding.footnoteLabel}>{t.finding.footnote}</Footnote>}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-caption text-fg-3">
                <HonestyTag kind="real">{c.honesty.real}</HonestyTag>
                <HonestyTag kind="model">{t.hero.oracle}</HonestyTag>
                {finding?.blockNumber != null && <span className="font-mono">{t.finding.source({ block: fmt.block(finding.blockNumber) })}</span>}
              </div>
            </div>
          </div>
        </Section>

        {/* 02 · Why on-chain */}
        <Section id="on-chain" index={2} kicker={t.onchain.kicker} title={t.onchain.title} lead={t.onchain.lead}>
          <OnchainUnlock
            missing={t.onchain.missing}
            copy={{
              external: c.footer.externalHint,
              report: {
                ...t.onchain.report,
                fee: t.onchain.report.fee({ fee: fmt.usd(GAUNTLET_AAVE_FEE_USD_PER_YEAR) }),
                sourceHref: GAUNTLET_FEE_SOURCE_URL,
              },
              block: {
                name: t.onchain.block.name,
                tags: t.onchain.block.tags,
                body: t.onchain.block.body,
                proof: t.onchain.block.proof,
                proofHref: findingProof ? txUrl(findingProof.hash) : txUrl(""),
                rows: [
                  [t.onchain.block.stuck, finding ? fmt.usd(finding.stuckDebtUsd) : null],
                  [t.onchain.block.cleared, finding ? fmt.usd(finding.clearedUsd) : null],
                  [t.onchain.block.block, finding?.blockNumber != null ? fmt.block(finding.blockNumber) : null],
                ],
              },
            }}
          />
        </Section>

        {/* 03 · Why Monad */}
        <Section id="monad" index={3} kicker={t.monad.kicker} title={t.monad.title} lead={t.monad.lead}>
          <div className="grid gap-4 lg:grid-cols-12">
            <article aria-labelledby="monad-gas" className="flex min-w-0 flex-col gap-5 rounded-panel border border-line-2 bg-elev-1 p-5 sm:p-7 lg:col-span-12">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="monad-gas" className="text-title-3 text-fg-1">
                  {scale ? t.monad.gas.title({ n: fmt.int(scale.positions) }) : <Skeleton className="h-[1lh] w-56" />}
                </h3>
                <HonestyTag kind="synthetic">{c.honesty.synthetic}</HonestyTag>
              </div>
              <ScaleGauge locale={locale} facts={scale?.facts ?? null} copy={t.monad.gas.copy} />
              {scale && (
                <a
                  href={txUrl(scale.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex w-fit items-center gap-1.5 font-mono text-caption text-fg-3 hover:text-fg-1"
                >
                  {t.monad.gas.source({ block: fmt.block(scale.blockNumber) })}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                  <span className="sr-only">({c.footer.externalHint})</span>
                </a>
              )}
            </article>

            <div className="grid min-w-0 gap-4 lg:col-span-12 lg:grid-cols-2">
              <article aria-labelledby="monad-reads" className="flex flex-col gap-4 rounded-panel border border-line-2 bg-elev-1 p-5 sm:p-7">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id="monad-reads" className="text-title-3 text-fg-1">
                    {t.monad.reads.title}
                  </h3>
                  <span className="font-mono text-metric-sm text-monad-hi">{t.monad.reads.ratio({ ratio: fmt.ratio(readRatio) })}</span>
                </div>
                <ul className="flex flex-col gap-3">
                  {(
                    [
                      [t.monad.reads.monad, MONAD_READ_GAS_PER_POSITION, "bg-monad", 1],
                      [t.monad.reads.ethereum, ETH_READ_GAS_PER_POSITION, "bg-fg-3", 0],
                    ] as const
                  ).map(([label, gas, bar, digits]) => (
                    <li key={label} className="flex flex-col gap-1.5">
                      <span className="flex items-baseline justify-between gap-3 text-body-sm">
                        <span className="text-fg-2">{label}</span>
                        <span className="font-mono text-fg-1">{t.monad.reads.gas({ gas: fmt.num(gas, digits) })}</span>
                      </span>
                      <span className="block h-2 w-full overflow-hidden rounded-full bg-elev-3">
                        <span className={cn("block h-full min-w-[2px] rounded-full", bar)} style={{ width: `${Math.round((gas / ETH_READ_GAS_PER_POSITION) * 10_000) / 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-fg-3">{t.monad.reads.note({ slots: fmt.int(MONAD_PAGE_SLOTS) })}</p>
              </article>

              <article aria-labelledby="monad-blocks" className="flex flex-col gap-4 rounded-panel border border-line-2 bg-elev-1 p-5 sm:p-7">
                <h3 id="monad-blocks" className="text-title-3 text-fg-1">
                  {t.monad.blocks.title({ block: fmt.ms(MONAD_BLOCK_TIME_MS), finality: fmt.ms(MONAD_FINALITY_MS) })}
                </h3>
                <LivePulse locale={locale} copy={t.monad.blocks.pulse} />
                <p className="text-body-sm text-fg-2">{t.monad.blocks.body}</p>
              </article>
            </div>
          </div>
        </Section>

        {/* 04 · Guard */}
        <Section id="guard" index={4} kicker={t.guard.kicker} title={t.guard.title} lead={t.guard.lead}>
          <div className="flex flex-col gap-5">
            <GuardTeaser locale={locale} markets={markets} guarded={{ a: MARKETS.a.guarded, b: MARKETS.b.guarded }} />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-caption text-fg-3">{markets ? t.guard.read : t.guard.missing}</p>
              <ButtonLink href={href("guard", locale)} variant="secondary">
                {t.guard.cta}
                <ButtonArrow />
              </ButtonLink>
            </div>
          </div>
        </Section>

        {/* 05 · Is my position safe? */}
        <Section id="wallet" index={5} kicker={t.wallet.kicker} title={t.wallet.title} lead={t.wallet.lead}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16">
            <WalletTeaser locale={locale} samples={WALLET_SAMPLES} />
            <figure className="flex flex-col items-center gap-3 rounded-panel border border-line-2 bg-elev-1 p-6" data-landing-dial="">
              <MiniDial
                locale={locale}
                value={positions?.largest?.healthFactor ?? null}
                copy={walletMessages[locale].dial}
                caption={
                  positions?.largest
                    ? positions.largest.thresholdDrop !== null && positions.largest.thresholdDrop > 0
                      ? t.wallet.dialCaption({ asset: meta.asset, drop: fmt.drop(positions.largest.thresholdDrop, 2), block: fmt.block(DEPLOYMENT.source.block) })
                      : t.wallet.dialCaptionSafe({ asset: meta.asset, block: fmt.block(DEPLOYMENT.source.block) })
                    : undefined
                }
              />
              {positions?.largest && (
                <figcaption className="flex flex-col items-center gap-2 text-center">
                  <HonestyTag kind="real">{c.honesty.real}</HonestyTag>
                  <span className="text-caption text-fg-3">{t.wallet.dialNote}</span>
                </figcaption>
              )}
            </figure>
          </div>
        </Section>

        {/* 06 · How it works */}
        <Section id="how" index={6} kicker={t.how.kicker} title={t.how.title}>
          <div className="flex flex-col gap-14">
            <ol className="grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 md:grid-cols-3">
              {t.how.steps.map(([title, body], i) => (
                <li key={title} className="flex flex-col gap-3 bg-elev-1 p-6">
                  <span className="font-mono text-caption text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-title-3 text-fg-1">{title}</h3>
                  <p className="text-body-sm text-fg-2">{body}</p>
                </li>
              ))}
            </ol>
            <Pipeline label={howMessages[locale].cascade.pipelineLabel} nodes={howMessages[locale].cascade.pipeline} />
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={href("how", locale)} variant="secondary">
                {t.how.cta}
                <ButtonArrow />
              </ButtonLink>
              <ButtonLink href={href("app", locale)} variant="primary">
                {t.hero.primary}
                <ButtonArrow />
              </ButtonLink>
            </div>
          </div>
        </Section>
      </HydrateOnIntent>
    </div>
  );
}
