import { ArrowDown } from "lucide-react";
import { ButtonArrow } from "@/design/ui/button-arrow";
import { ButtonLink } from "@/design/ui/button-link";
import { HonestyTag } from "@/design/ui/honesty";
import { metricText, SkeletonMetric } from "@/design/ui/skeleton";
import { toneSolid } from "@/design/ui/tone";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { commonMessages } from "@/i18n/messages/common";
import type { LandingMessages } from "@/i18n/messages/landing";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { SplitText } from "@/motion/split-text";
import { WinnerBadge } from "@/shell/winner-badge";
import type { LandingFinding } from "./data";
import styles from "./shock-scene.module.css";

/** What the finding is about, known without the network (preset + deployment.json). */
export type FindingMeta = { asset: string; shock: number; bookPositions: number };

/**
 * The first screen: badge, headline (CSS SplitText, no hydration wait), the live finding with its
 * honesty labels, and the two CTAs. Server-rendered so the LCP never depends on JavaScript.
 */
export function HeroIntro({ locale, t, finding, meta }: { locale: Locale; t: LandingMessages; finding: LandingFinding | null; meta: FindingMeta }) {
  const c = commonMessages[locale];
  const fmt = formatters(locale);

  return (
    <div className={`page-shell flex h-full flex-col pb-10 sm:pb-24 lg:pb-20 ${styles.introBody}`}>
      <div className="flex max-w-4xl flex-col items-start gap-6 lg:gap-7">
        <WinnerBadge label={c.badge.winner} event={c.badge.event} className="animate-fade-in" />
        <SplitText as="h1" lines={t.hero.lines} accent={t.hero.accent} className="text-display text-fg-1" />

        {/* No entrance on this block: its honesty chips and the metric are the page's LCP candidates
            (the headline is split into small word boxes), and an element that starts at opacity 0
            only counts once it shows, 320 ms + the rise later, after every eager script. */}
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-body-sm text-fg-2">
            {t.hero.findingLabel({ shock: fmt.drop(meta.shock, 0), asset: meta.asset })}
          </p>
          {/* Static text, not a rolling metric: the value never changes on this page, and the hero
              ships no number-animation code (it is often the LCP element). Same box as MetricValue. */}
          <span
            data-slot="metric-value"
            data-landing-hero-metric=""
            aria-busy={finding ? undefined : true}
            className={cn("flex h-[1lh] max-w-full items-center whitespace-nowrap font-mono", metricText.xl, toneSolid.warn)}
          >
            {finding ? (
              fmt.usd(finding.stuckDebtUsd)
            ) : (
              <>
                <span className="sr-only">{c.common.loading}</span>
                <SkeletonMetric size="xl" chars={7} />
              </>
            )}
          </span>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-caption text-fg-3">
            <span className="inline-flex items-start gap-1.5">
              <span aria-hidden className="mt-[calc(0.5lh-0.1875rem)] size-1.5 shrink-0 rounded-full bg-safe motion-safe:animate-live" />
              {finding?.blockNumber != null ? t.hero.live({ block: fmt.block(finding.blockNumber) }) : t.hero.liveMissing}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <HonestyTag kind="real">
              {t.hero.realBook({
                borrowers: fmt.int(DEPLOYMENT.source.borrowersWithDebt),
                positions: fmt.int(finding?.positionsUsed ?? meta.bookPositions),
                asset: meta.asset,
              })}
            </HonestyTag>
            <HonestyTag kind="model">{t.hero.oracle}</HonestyTag>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 animate-rise [animation-delay:440ms]">
          <ButtonLink href={href("app", locale)} variant="primary" size="lg">
            {t.hero.primary}
            <ButtonArrow />
          </ButtonLink>
          <ButtonLink href={href("wallet", locale)} variant="secondary" size="lg">
            {t.hero.secondary}
          </ButtonLink>
        </div>
      </div>
      <p aria-hidden className={`mt-8 hidden items-center gap-2 label-mono text-fg-3 sm:flex ${styles.cue}`}>
        <ArrowDown className="size-3.5" />
        {t.hero.scroll}
      </p>
    </div>
  );
}
