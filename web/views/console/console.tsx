"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCue } from "@/audio/use-cue";
import { Panel, PanelBody } from "@/design/ui/panel";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import { usePreview } from "@/lib/chain/hooks/usePreview";
import { BASE_SETTINGS, buildScenario, DEFAULT_PRESET_ID, matchPreset } from "@/lib/chain/scenario";
import type { Scenario, Settings } from "@/lib/chain/types";
import { PanelHeading } from "../shared/panel-heading";
import { AnalysisTabs } from "./analysis-tabs";
import type { InitialPreview } from "./data";
import type { ConsolePreset } from "./model";
import { PresetFromUrl } from "./preset-from-url";
import { ResultStage, type PreviewState } from "./result-stage";
import { RunAssumptions } from "./run-assumptions";
import { ScenarioInputs } from "./scenario-inputs";
import { SignerStrip } from "./signer-strip";

type Props = {
  locale: Locale;
  /** Visible presets with their facts, computed on the server with a fixed `now`. */
  presets: readonly ConsolePreset[];
  /** The server's clock at render (days to maturity), so server and browser markup agree. */
  nowMs: number;
  /** The default preset's preview read on the server; null when it could not be read. */
  initial?: InitialPreview | null;
  /** The honesty labels of the default settings, rendered on the server. */
  initialAssumptions: ReactNode;
};

/**
 * The protocol console: signer strip, scenario inputs with the free live preview, the result stage and
 * the deeper analysis tabs. The selected preset is derived from the settings (`matchPreset`), so any
 * manual change that leaves a preset clears it.
 */
export function Console({ locale, presets, nowMs, initial = null, initialAssumptions }: Props) {
  const t = consoleMessages[locale];
  const [defaults] = useState<Settings>(() => ({ ...(presets.find((p) => p.id === DEFAULT_PRESET_ID)?.settings ?? BASE_SETTINGS) }));
  const [settings, setSettings] = useState<Settings>(defaults);
  const presetId = matchPreset(settings);
  const scenario = useMemo(() => buildScenario(settings), [settings]);
  const preview = usePreview(scenario, initial);
  const onDefaults = sameSettings(settings, defaults);
  // Only scenarios the viewer picked sound the boom: not the first preview, not the ?preset= jump.
  const touched = useRef(false);
  const edit = useCallback((next: Settings | ((s: Settings) => Settings)) => {
    touched.current = true;
    setSettings(next);
  }, []);
  // Stable callbacks: the inputs are a memo, so a preview landing does not re-render them.
  const onPreset = useCallback((p: ConsolePreset) => edit({ ...p.settings }), [edit]);
  const onChange = useCallback((patch: Partial<Settings>) => edit((s) => ({ ...s, ...patch })), [edit]);
  useSettledBoom(scenario, preview, touched);
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
            <PanelHeading title={t.inputs.title} />
            <PanelBody>
              <ScenarioInputs locale={locale} presets={presets} settings={settings} presetId={presetId} onPreset={onPreset} onChange={onChange} />
            </PanelBody>
          </Panel>
          {/* The default settings' labels come rendered from the server (no component code of theirs runs in the browser); other settings render here. */}
          {onDefaults ? initialAssumptions : <RunAssumptions locale={locale} settings={settings} nowMs={nowMs} />}
        </aside>
        <div className="col-span-full min-w-0 md:col-span-8 lg:col-span-8">
          <ResultStage locale={locale} settings={settings} preview={preview} initial={initial} />
        </div>
      </div>
      <AnalysisTabs locale={locale} settings={settings} result={preview.result} />
    </div>
  );
}

const sameSettings = (a: Settings, b: Settings) => (Object.keys(a) as (keyof Settings)[]).every((k) => a[k] === b[k]);

/**
 * `cue("boom")` once per settled result: the preview for the scenario now on screen has landed (not
 * loading, no error, not a stale result), it differs from the last one that landed, and the viewer
 * changed the inputs at least once. Slider drags only re-run the preview after its debounce, so a
 * drag sounds once, when its result settles.
 */
function useSettledBoom(scenario: Scenario, preview: PreviewState, touched: { readonly current: boolean }) {
  const cue = useCue();
  const last = useRef<string | null>(null);
  const { result, resultScenario, loading, error } = preview;
  useEffect(() => {
    if (loading || error || !result || !resultScenario) return;
    const key = JSON.stringify(resultScenario);
    if (key !== JSON.stringify(scenario) || key === last.current) return;
    last.current = key;
    if (touched.current) cue("boom");
  }, [scenario, result, resultScenario, loading, error, touched, cue]);
}
