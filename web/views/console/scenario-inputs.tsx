"use client";

import { Activity, Check, ChevronDown, Droplets, Flame, Layers3, Timer, TrendingDown, Waves, Zap, type LucideIcon } from "lucide-react";
import { memo, useId } from "react";
import { Chip, ChipGroup } from "@/design/ui/chip";
import { Label } from "@/design/ui/label";
import { Segmented } from "@/design/ui/segmented";
import { Slider } from "@/design/ui/slider";
import type { Tone } from "@/design/ui/tone";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import {
  assetFacts,
  isCalibratedRun,
  oracleMode,
  ORACLE_FEEDBACK_BPS,
  pickerAssets,
  resolutionOptions,
  ROUNDS_RANGE,
  SHOCK_CHIPS_PCT,
  SHOCK_SLIDER_PCT,
  STEPS_RANGE,
  symbolParts,
  type PresetId,
} from "@/lib/chain/scenario";
import type { OracleMode, Settings } from "@/lib/chain/types";
import { cn } from "@/lib/utils";
import { LazyDisclosure } from "@/viz/lazy-disclosure";
import { presetText, shockLabel, type ConsolePreset } from "./model";

const PRESET_ICON: Record<PresetId, LucideIcon> = {
  ufak: Activity,
  sali: Waves,
  worst: Flame,
  pt: Timer,
  "maple-eth": Layers3,
  eth: TrendingDown,
  derin: Droplets,
  stres: Zap,
};

/** Slider color follows the shock (calm → warn → liq). A UI choice, the value is always printed. */
const shockTone = (pct: number): Tone => (pct < 3 ? "calm" : pct < 10 ? "warn" : "liq");

type Props = {
  locale: Locale;
  presets: readonly ConsolePreset[];
  settings: Settings;
  presetId: PresetId | null;
  onPreset: (preset: ConsolePreset) => void;
  onChange: (patch: Partial<Settings>) => void;
};

/** Left panel: presets, asset, shock, oracle and the advanced path settings. */
export const ScenarioInputs = memo(function ScenarioInputs({ locale, presets, settings, presetId, onPreset, onChange }: Props) {
  const t = consoleMessages[locale].inputs;
  const fmt = formatters(locale);
  const ids = { presets: useId(), asset: useId(), others: useId(), chips: useId(), oracle: useId() };
  const { featured, others } = pickerAssets();
  const asset = assetFacts(settings.assetId);
  const selected = presets.find((p) => p.id === presetId) ?? null;
  const mode = oracleMode(settings.feedback);
  const calibratedRun = isCalibratedRun(settings);
  const resolutions = resolutionOptions(settings.assetId);

  const pickAsset = (id: number) => {
    const next = assetFacts(id);
    onChange({ assetId: id, calibrated: settings.calibrated && Boolean(next?.canCalibrate) });
  };

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby={ids.presets} className="flex flex-col gap-3">
        <Label as="h3" id={ids.presets}>
          {t.presets}
        </Label>
        <div role="group" aria-labelledby={ids.presets} className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => {
            const Icon = PRESET_ICON[p.id];
            const text = presetText(p.facts, fmt);
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPreset(p)}
                className={cn(
                  "group/preset relative flex min-h-[4.25rem] min-w-0 flex-col items-start gap-1 rounded-control border px-3 py-2.5 text-left",
                  "transition-[background-color,border-color,scale] duration-(--dur-fast) ease-out-quart active:scale-[0.98] motion-reduce:active:scale-100",
                  active ? "border-fg-3 bg-elev-3" : "border-line-2 bg-bg hover:border-line-3 hover:bg-elev-2",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <Icon aria-hidden className={cn("size-3.5 shrink-0", active ? "text-fg-1" : "text-fg-3 group-hover/preset:text-fg-2")} />
                  <span className="min-w-0 flex-1 text-body-sm leading-tight font-medium text-fg-1">{t.presetTitle[p.id](text)}</span>
                  {active && <Check aria-hidden className="size-3.5 shrink-0 text-fg-1" />}
                </span>
                <span className="font-mono text-caption leading-tight text-fg-3">{t.presetLine[p.id](text)}</span>
              </button>
            );
          })}
        </div>
        <p className="min-h-[2lh] text-caption text-fg-2" aria-live="polite">
          {selected ? t.presetStory[selected.id](presetText(selected.facts, fmt)) : <span className="text-fg-3">{t.custom}</span>}
        </p>
      </section>

      <section aria-labelledby={ids.asset} className="flex flex-col gap-3">
        <Label as="h3" id={ids.asset}>
          {t.asset}
        </Label>
        <div role="group" aria-labelledby={ids.asset} className="grid grid-cols-2 gap-1.5">
          {featured.map((a) => {
            const active = a.id === settings.assetId;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                onClick={() => pickAsset(a.id)}
                className={cn(
                  "flex min-h-11 min-w-0 flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left",
                  "transition-[background-color,border-color] duration-(--dur-fast) ease-out-quart",
                  active ? "border-fg-3 bg-elev-3" : "border-line-2 bg-bg hover:border-line-3 hover:bg-elev-2",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 text-body-sm font-medium text-fg-1">
                  {symbolParts(a).base}
                  {active && <Check aria-hidden className="size-3.5 text-fg-1" />}
                </span>
                <span className="font-mono text-caption text-fg-3">
                  {t.featuredNote} · {fmt.usd(a.collateralUsd)}
                </span>
              </button>
            );
          })}
        </div>
        <label htmlFor={ids.others} className="sr-only">
          {t.others}
        </label>
        <div className="relative">
          <select
            id={ids.others}
            value={featured.some((a) => a.id === settings.assetId) ? "" : String(settings.assetId)}
            onChange={(e) => {
              if (e.target.value) pickAsset(Number(e.target.value));
            }}
            className={cn(
              "h-11 w-full appearance-none rounded-control border border-line-strong bg-bg pr-9 pl-3 text-body-sm text-fg-1",
              "transition-colors duration-(--dur-fast) ease-out-quart hover:border-fg-3",
            )}
          >
            <option value="" disabled>
              {t.othersPlaceholder}
            </option>
            {others.map((a) => {
              const p = symbolParts(a);
              return (
                <option key={a.id} value={a.id}>
                  {p.base} · {t.chain[p.chain]}
                </option>
              );
            })}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-3" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Slider
          label={t.shock}
          showValue
          value={settings.shockPct}
          onValueChange={(v) => onChange({ shockPct: Math.round(v * 10) / 10 })}
          min={SHOCK_SLIDER_PCT.min}
          max={SHOCK_SLIDER_PCT.max}
          step={SHOCK_SLIDER_PCT.step}
          toneForValue={shockTone}
          ticks={SHOCK_SLIDER_PCT.max - SHOCK_SLIDER_PCT.min}
          majorEvery={10}
          formatValue={(v) => shockLabel(v, fmt)}
        />
        <ChipGroup aria-label={t.chips} className="gap-1">
          {SHOCK_CHIPS_PCT.map((v) => (
            <Chip key={v} mono pressed={settings.shockPct === v} tone={shockTone(v)} onClick={() => onChange({ shockPct: v })}>
              {shockLabel(v, fmt)}
            </Chip>
          ))}
        </ChipGroup>
      </section>

      <section aria-labelledby={ids.oracle} className="flex flex-col gap-3">
        <Label as="h3" id={ids.oracle}>
          {t.oracle}
        </Label>
        <Segmented<OracleMode>
          aria-label={t.oracle}
          value={mode}
          onValueChange={(m) => onChange({ feedback: ORACLE_FEEDBACK_BPS[m] })}
          options={[
            { value: "external", label: t.oracleExternal, description: t.oracleExternalNote },
            { value: "pool", label: t.oraclePool, description: t.oraclePoolNote },
          ]}
        />
      </section>

      {/* The path settings mount the first time the panel opens (two sliders and two switches less to hydrate). */}
      <LazyDisclosure summary={t.advanced} variant="panel" mono>
        <div className="flex flex-col gap-5">
          <Slider
            label={t.steps}
            showValue
            value={settings.steps}
            onValueChange={(v) => onChange({ steps: v })}
            min={STEPS_RANGE.min}
            max={STEPS_RANGE.max}
            tone="neutral"
            formatValue={(v) => t.stepsValue({ n: fmt.int(v) })}
          />
          <Slider
            label={t.rounds}
            showValue
            value={settings.rounds}
            onValueChange={(v) => onChange({ rounds: v })}
            min={ROUNDS_RANGE.min}
            max={ROUNDS_RANGE.max}
            tone="neutral"
            formatValue={(v) => fmt.int(v)}
          />
          {asset?.canCalibrate && (
            <div className="flex flex-col gap-2">
              <Label as="p">{t.book}</Label>
              <Segmented
                aria-label={t.book}
                size="sm"
                value={calibratedRun ? "calibrated" : "real"}
                onValueChange={(v) => onChange({ calibrated: v === "calibrated" })}
                options={[
                  { value: "real", label: t.bookReal({ n: fmt.int(asset.realPositions) }) },
                  { value: "calibrated", label: t.bookCalibrated({ n: fmt.int(asset.calibratedPositions) }) },
                ]}
              />
            </div>
          )}
          {calibratedRun && resolutions.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label as="p">{t.resolution}</Label>
              <Segmented
                aria-label={t.resolution}
                size="sm"
                value={String(Math.min(settings.resolution, asset?.calibratedPositions ?? settings.resolution))}
                onValueChange={(v) => onChange({ resolution: Number(v) })}
                options={resolutions.map((n) => ({ value: String(n), label: fmt.int(n) }))}
              />
            </div>
          )}
        </div>
      </LazyDisclosure>
    </div>
  );
});
