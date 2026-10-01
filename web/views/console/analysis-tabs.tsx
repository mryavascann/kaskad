"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import type { Result, Settings } from "@/lib/chain/types";

// The tabs (Radix Tabs, Motion indicator) and every panel are separate chunks, loaded on approach.
const AnalysisTabsLive = lazy(() => import("./analysis-tabs-live").then((m) => ({ default: m.AnalysisTabsLive })));

/**
 * Monte Carlo, stress curve and the two-network table. The section's code loads and its open tab
 * mounts (and runs its first preview) only once it is about to scroll into view: on load the RPC,
 * the main thread and the DOM belong to the scenario and its result. Until then it holds its place
 * (a tab row and a panel's height), below the fold on every screen.
 */
export function AnalysisTabs({ locale, settings, result }: { locale: Locale; settings: Settings; result: Result | null }) {
  const t = consoleMessages[locale].tabs;
  const [ref, armed] = useArmOnApproach<HTMLElement>();
  const hold = <div aria-hidden className="min-h-[36.75rem]" />;
  return (
    <section ref={ref} aria-labelledby="analysis-title" className="flex min-w-0 flex-col gap-2">
      <h2 id="analysis-title" className="sr-only">
        {t.label}
      </h2>
      {armed ? (
        <Suspense fallback={hold}>
          <AnalysisTabsLive locale={locale} settings={settings} result={result} />
        </Suspense>
      ) : (
        hold
      )}
    </section>
  );
}

/** How far below the viewport the section may still be when its tab mounts (it is ready on arrival). */
const APPROACH_MARGIN = "400px 0px";

/** `armed` turns true (once) when the element comes within `APPROACH_MARGIN` of the viewport. */
function useArmOnApproach<T extends Element>() {
  const ref = useRef<T>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (armed || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer (old browsers): load it after the first paint.
      const id = setTimeout(() => setArmed(true), 0);
      return () => clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setArmed(true);
      },
      { rootMargin: APPROACH_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);
  return [ref, armed] as const;
}
