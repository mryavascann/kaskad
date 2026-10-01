/**
 * The guard teaser's markup, server-safe (no hooks, no client code): the two demo markets as the
 * server read them. `GuardTeaserStatic` is the static server rendering (the read state); the live
 * `GuardTeaser` (./guard-teaser.tsx) renders the same cards and may hold a tripped breaker armed
 * until the cards scroll into view (`held`).
 */
import { Lock, LockOpen } from "lucide-react";
import type { Ref } from "react";
import { Badge } from "@/design/ui/badge";
import { Label } from "@/design/ui/label";
import { Skeleton } from "@/design/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages, type LandingMessages } from "@/i18n/messages/landing";
import type { MarketId } from "@/lib/chain/guard";
import { cn } from "@/lib/utils";
import { Breaker, type BreakerState } from "../guard/breaker";
import type { LandingMarkets } from "./data";

export type GuardTeaserProps = { locale: Locale; markets: LandingMarkets | null; guarded: Record<MarketId, boolean> };

/** Both market cards. `held`: market B's tripped breaker is shown armed (the live teaser, before B is in view). */
export function GuardCards({ locale, markets, guarded, held = false, rootRef }: GuardTeaserProps & { held?: boolean; rootRef?: Ref<HTMLDivElement> }) {
  const t = landingMessages[locale].guard;
  return (
    <div ref={rootRef} className="grid gap-4 sm:grid-cols-2" data-landing-guard="">
      {(["a", "b"] as MarketId[]).map((id) => {
        const m = markets?.[id] ?? null;
        const isGuarded = guarded[id];
        const paused = m?.paused ?? false;
        const shownPaused = paused && !(held && id === "b");
        const breaker: BreakerState = !isGuarded ? "none" : m === null ? "unknown" : shownPaused ? "tripped" : "armed";
        return <MarketCard key={id} id={id} locale={locale} t={t} market={m} guarded={isGuarded} breaker={breaker} paused={paused} shownPaused={shownPaused} />;
      })}
    </div>
  );
}

/** The teaser as static server HTML (no client code): each market's read state. Same markup as the live `GuardTeaser` at first render. */
export function GuardTeaserStatic(props: GuardTeaserProps) {
  return <GuardCards {...props} />;
}

function MarketCard({
  id,
  locale,
  t,
  market,
  guarded,
  breaker,
  paused,
  shownPaused,
}: {
  id: MarketId;
  locale: Locale;
  t: LandingMessages["guard"];
  market: LandingMarkets["a"] | null;
  guarded: boolean;
  breaker: BreakerState;
  paused: boolean;
  shownPaused: boolean;
}) {
  const fmt = formatters(locale);
  return (
    <article
      aria-labelledby={`landing-market-${id}`}
      className={cn(
        "flex flex-col gap-5 rounded-panel border bg-elev-1 p-5 transition-[border-color,box-shadow] duration-(--dur-slow)",
        shownPaused ? "border-liq/55 shadow-glow-liq" : "border-line-2",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={`landing-market-${id}`} className="label-mono text-fg-2">
          {t[id].name}
        </h3>
        {market === null ? (
          <Skeleton className="h-6 w-32" />
        ) : paused ? (
          <Badge tone="liq" variant="solid" mono size="md" icon={Lock} className={cn("transition-opacity duration-(--dur-base)", !shownPaused && "opacity-0")}>
            {t.paused}
          </Badge>
        ) : (
          <Badge tone="safe" variant="outline" mono size="md" icon={LockOpen}>
            {t.open}
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-body-sm text-fg-2">{t[id].role}</p>
        <div className="flex flex-col items-end gap-1">
          <Breaker state={breaker} />
          <Label tone={guarded && shownPaused ? "liq" : undefined}>{!guarded ? t.breakerNone : shownPaused ? t.breakerTripped : t.breakerArmed}</Label>
        </div>
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="label-mono text-fg-3">{t.maxLtv}</span>
        {market === null ? (
          <Skeleton className="h-5 w-12" />
        ) : (
          <span className={cn("font-mono text-metric-sm", guarded && paused ? "text-warn" : "text-fg-1")}>{fmt.pct(market.maxLtvBps / 10_000, 0)}</span>
        )}
      </div>
    </article>
  );
}
