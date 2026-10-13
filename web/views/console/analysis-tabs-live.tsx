"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/design/ui/tabs";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import type { Result, Scenario, Settings } from "@/lib/chain/types";

// Each tab's code (charts, hooks, the Monte Carlo proof flow) is its own chunk, loaded when it mounts.
const MonteCarloTab = lazy(() => import("./monte-carlo-tab").then((m) => ({ default: m.MonteCarloTab })));
const StressTab = lazy(() => import("./analysis-panels").then((m) => ({ default: m.StressTab })));
const NetworksTab = lazy(() => import("./analysis-panels").then((m) => ({ default: m.NetworksTab })));
const ExposureTab = lazy(() => import("./exposure-tab").then((m) => ({ default: m.ExposureTab })));

/** Panel height while a tab's chunk loads (the tallest panels are about this tall on phones). */
export const PANEL_HOLD = "min-h-[32rem]";

/**
 * Monte Carlo, stress curve, the two-network table and who is exposed (loaded by `AnalysisTabs` as the section
 * approaches). Inactive tabs are unmounted (Radix), so only the open tab's previews hit the RPC.
 */
export function AnalysisTabsLive({
  locale,
  settings,
  result,
  resultScenario,
}: {
  locale: Locale;
  settings: Settings;
  result: Result | null;
  /** The scenario `result` is the preview of (usePreview().resultScenario). */
  resultScenario: Scenario | null;
}) {
  const t = consoleMessages[locale].tabs;
  const panel = (content: ReactNode) => <Suspense fallback={<div aria-hidden className={PANEL_HOLD} />}>{content}</Suspense>;
  return (
    <Tabs defaultValue="mc">
      <TabsList aria-label={t.label}>
        <TabsTrigger value="mc">{t.mc}</TabsTrigger>
        <TabsTrigger value="stress">{t.stress}</TabsTrigger>
        <TabsTrigger value="networks">{t.networks}</TabsTrigger>
        <TabsTrigger value="exposure">{t.exposure}</TabsTrigger>
      </TabsList>
      <TabsContent value="mc" className="mt-8">
        {panel(<MonteCarloTab locale={locale} settings={settings} />)}
      </TabsContent>
      <TabsContent value="stress" className="mt-8">
        {panel(<StressTab locale={locale} settings={settings} />)}
      </TabsContent>
      <TabsContent value="networks" className="mt-8">
        {panel(<NetworksTab locale={locale} settings={settings} result={result} />)}
      </TabsContent>
      <TabsContent value="exposure" className="mt-8">
        {panel(<ExposureTab locale={locale} settings={settings} scenario={resultScenario} result={result} />)}
      </TabsContent>
    </Tabs>
  );
}
