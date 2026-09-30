"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { Footnote } from "@/design/ui/footnote";
import { Panel, PanelBody, PanelHeader } from "@/design/ui/panel";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import { usePreview } from "@/lib/chain/hooks/usePreview";
import { BASE_SETTINGS, buildScenario, DEFAULT_PRESET_ID, matchPreset } from "@/lib/chain/scenario";
import type { Settings } from "@/lib/chain/types";
import { AnalysisTabs } from "./analysis-tabs";
import type { ConsolePreset } from "./model";
import { PresetFromUrl } from "./preset-from-url";
import { ResultStage } from "./result-stage";
import { RunAssumptions } from "./run-assumptions";
import { ScenarioInputs } from "./scenario-inputs";
import { SignerStrip } from "./signer-strip";

type Props = {
  locale: Locale;
  /** Visible presets with their facts, computed on the server with a fixed `now`. */
  presets: readonly ConsolePreset[];
  /** The server's clock at render (days to maturity), so server and browser markup agree. */
  nowMs: number;
};

/**
 * The protocol console: signer strip, scenario inputs with the free live preview, the result stage and
 * the deeper analysis tabs. The selected preset is derived from the settings (`matchPreset`), so any
 * manual change that leaves a preset clears it.
 */
export function Console({ locale, presets, nowMs }: Props) {
  const t = consoleMessages[locale];
  const [settings, setSettings] = useState<Settings>(() => ({ ...(presets.find((p) => p.id === DEFAULT_PRESET_ID)?.settings ?? BASE_SETTINGS) }));
  const presetId = matchPreset(settings);
  const scenario = useMemo(() => buildScenario(settings), [settings]);
  const preview = usePreview(scenario);
  const fromUrl = useCallback(
    (id: string) => {
      const p = presets.find((x) => x.id === id);
      if (p) setSettings({ ...p.settings });
    },
    [presets],
  );

  return (
    <div className="flex flex-col gap-14">
      <Suspense fallback={null}>
        <PresetFromUrl onPreset={fromUrl} />
      </Suspense>
      <SignerStrip locale={locale} />

      <div className="grid-page items-start gap-y-12">
        <aside aria-label={t.inputs.title} className="col-span-full flex flex-col gap-6 md:col-span-8 lg:col-span-4">
          <Panel>
            <PanelHeader title={t.inputs.title} />
            <PanelBody>
              <ScenarioInputs
                locale={locale}
                presets={presets}
                settings={settings}
                presetId={presetId}
                onPreset={(p) => setSettings({ ...p.settings })}
                onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
              />
            </PanelBody>
          </Panel>
          <RunAssumptions locale={locale} settings={settings} nowMs={nowMs} />
        </aside>
        <div className="col-span-full min-w-0 md:col-span-8 lg:col-span-8">
          <ResultStage locale={locale} settings={settings} preview={preview} />
        </div>
      </div>

      <AnalysisTabs locale={locale} settings={settings} result={preview.result} />

      <Footnote label={t.footnote.label} className="max-w-3xl border-t border-line pt-6">
        {t.footnote.body}
      </Footnote>
    </div>
  );
}
