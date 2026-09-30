"use client";

/**
 * Guard teaser: the two demo markets as the server read them (`readMarkets`, no poll here). The
 * server render and no-JS show the real state. After hydration a tripped breaker is re-armed on
 * screen until the cards scroll into view, then drops to the state that was read (it never shows a
 * state the chain didn't report once in view). Reduced motion: the read state, no lever travel.
 */
import { Lock, LockOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/design/ui/badge";
import { Label } from "@/design/ui/label";
import { Skeleton } from "@/design/ui/skeleton";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages, type LandingMessages } from "@/i18n/messages/landing";
import { MARKETS, type MarketId } from "@/lib/chain/guard";
import { cn } from "@/lib/utils";
import { useShouldReduceMotion } from "@/motion/hooks";
import { Breaker, type BreakerState } from "../guard/breaker";
import type { LandingMarkets } from "./data";

export function GuardTeaser({ locale, markets }: { locale: Locale; markets: LandingMarkets | null }) {
  const t = landingMessages[locale].guard;
  const root = useRef<HTMLDivElement>(null);
  const reduce = useShouldReduceMotion();
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || reduce || !markets?.b.paused || typeof IntersectionObserver === "undefined") return;
    let first = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        const initial = first;
        first = false;
        if (initial && !entry?.isIntersecting) {
          setHeld(true);
          return;
        }
        if (entry?.isIntersecting) {
          io.disconnect();
          // Let the armed lever paint once before it drops.
          window.setTimeout(() => setHeld(false), 450);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, markets?.b.paused]);

  return (
    <div ref={root} className="grid gap-4 sm:grid-cols-2" data-landing-guard="">
      {(["a", "b"] as MarketId[]).map((id) => {
        const m = markets?.[id] ?? null;
        const guarded = MARKETS[id].guarded;
        const paused = m?.paused ?? false;
        const shownPaused = paused && !(held && id === "b");
        const breaker: BreakerState = !guarded ? "none" : m === null ? "unknown" : shownPaused ? "tripped" : "armed";
        return <MarketCard key={id} id={id} locale={locale} t={t} market={m} breaker={breaker} paused={paused} shownPaused={shownPaused} />;
      })}
    </div>
  );
}

function MarketCard({
  id,
  locale,
  t,
  market,
  breaker,
  paused,
  shownPaused,
}: {
  id: MarketId;
  locale: Locale;
  t: LandingMessages["guard"];
  market: LandingMarkets["a"] | null;
  breaker: BreakerState;
  paused: boolean;
  shownPaused: boolean;
}) {
  const fmt = formatters(locale);
  const guarded = MARKETS[id].guarded;
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
