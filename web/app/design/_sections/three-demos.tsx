"use client";

/**
 * /design demos for the hero scene: the live stage with a timeline scrubber, Play / Replay, the
 * loading vs data state, a poster override and a small frame readout; the poster at the same frame
 * next to it. Data: the recorded syrupUSDC −3 % preview, classified on the server.
 */
import { Pause, Play, RotateCcw } from "lucide-react";
import { animate, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/design/ui/button";
import { Readout, ReadoutRow } from "@/design/ui/readout";
import { Segmented } from "@/design/ui/segmented";
import { Slider } from "@/design/ui/slider";
import { Switch } from "@/design/ui/switch";
import { cn } from "@/lib/utils";
import type { HeroModeDecision, HeroModeReason } from "@/three/capability";
import { blockAt, dropAt, type HeroTimeline } from "@/three/data";
import { HeroPoster } from "@/three/hero-poster";
import type { HeroQuality, HeroStats } from "@/three/hero-scene";
import { HeroStage } from "@/three/hero-stage";
import { TIMING, type HeroPosition } from "@/three/model";

export type HeroLabData = {
  positions: HeroPosition[];
  timeline: HeroTimeline;
  /** Real position count of the book (deployment.json), for the loading row. */
  placeholderCount: number;
  /** Oracle price at block 0 (USD), for the readout. */
  startPrice: number;
  /** "Recorded preview, block …". */
  source: string;
};

const REASONS: Record<HeroModeReason, string> = {
  capable: "capable device",
  "forced-scene": "forced scene",
  "forced-poster": "forced poster",
  "reduced-motion": "reduced motion",
  "no-webgl": "no WebGL 2",
  "save-data": "data saver",
  "low-cpu": "≤ 2 cores",
  "low-memory": "≤ 2 GB memory",
  "software-renderer": "software renderer",
  "scene-failed": "scene failed",
};

const SCRUB_STEPS = 1000;
const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

type DataState = "loading" | "data";

export function HeroSceneLab({ data }: { data: HeroLabData }) {
  const progress = useMotionValue(0);
  const [value, setValue] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [state, setState] = useState<DataState>("data");
  const [forcePoster, setForcePoster] = useState(false);
  const [quality, setQuality] = useState<HeroQuality>("auto");
  const [decision, setDecision] = useState<HeroModeDecision | null>(null);
  const [stats, setStats] = useState<HeroStats | null>(null);
  const playback = useRef<AnimationPlaybackControls | null>(null);

  useMotionValueEvent(progress, "change", (v) => setValue(v));
  useEffect(() => () => playback.current?.stop(), []);

  const stop = () => {
    playback.current?.stop();
    playback.current = null;
    setPlaying(false);
  };
  const play = () => {
    stop();
    // From the end, start over. `jump` stops running animations, so it must come before `animate`.
    if (progress.get() >= 1) progress.jump(0);
    const from = progress.get();
    setPlaying(true);
    playback.current = animate(progress, 1, {
      duration: TIMING.seconds * (1 - from),
      ease: "linear",
      onComplete: () => setPlaying(false),
    });
  };
  const replay = () => {
    stop();
    progress.jump(0);
    play();
  };

  const block = blockAt(data.timeline, value);
  const drop = dropAt(data.timeline, value);
  const positions = state === "data" ? data.positions : null;
  // The poster panel follows the scrubber in 1 % steps (it is plain SVG, re-rendered by React).
  const posterFrame = Math.round(value * 100) / 100;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <figure className="flex min-w-0 flex-col overflow-hidden rounded-panel border border-line-2 bg-elev-1 shadow-panel">
        <HeroStage
          className="aspect-video w-full"
          positions={positions}
          progress={progress}
          placeholderCount={data.placeholderCount}
          mode={forcePoster ? "poster" : "scene"}
          // "Auto" leaves the choice to the stage: adaptive, or pinned high in demo mode (?demo=1).
          quality={quality === "auto" ? undefined : quality}
          posterProgress={posterFrame}
          onModeChange={setDecision}
          onStats={setStats}
        />
        <figcaption className="flex flex-col gap-4 border-t border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={playing ? stop : play} aria-pressed={playing}>
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              {playing ? "Pause" : "Play"}
            </Button>
            <Button size="sm" variant="ghost" onClick={replay}>
              <RotateCcw aria-hidden />
              Replay
            </Button>
            <Segmented
              size="sm"
              aria-label="Data state"
              value={state}
              onValueChange={setState}
              options={[
                { value: "loading", label: "Loading (no data)" },
                { value: "data", label: "Recorded outcomes" },
              ]}
            />
            <Switch size="sm" label="Force poster" checked={forcePoster} onCheckedChange={setForcePoster} />
          </div>
          <Slider
            label="Timeline"
            showValue
            tone={drop > 0 ? "warn" : "calm"}
            value={Math.round(value * SCRUB_STEPS)}
            min={0}
            max={SCRUB_STEPS}
            ticks={20}
            majorEvery={5}
            formatValue={(v) => `Block ${Math.floor(blockAt(data.timeline, v / SCRUB_STEPS) + 1e-9)} of ${data.timeline.steps}`}
            onValueChange={(v) => {
              stop();
              progress.set(v / SCRUB_STEPS);
            }}
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-caption text-fg-3 sm:grid-cols-4">
            <div className="flex justify-between gap-2 sm:block">
              <dt>Oracle price</dt>
              <dd className="text-fg-1">{price.format(data.startPrice * (1 - drop))}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt>Drop</dt>
              <dd className={cn(drop > 0 ? "text-warn" : "text-fg-1")}>{percent.format(-drop)}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt>Block</dt>
              <dd className="text-fg-1">{block.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt>Progress</dt>
              <dd className="text-fg-1">{value.toFixed(3)}</dd>
            </div>
          </dl>
        </figcaption>
      </figure>

      <div className="flex min-w-0 flex-col gap-4">
        <figure className="flex flex-col overflow-hidden rounded-panel border border-line-2 bg-elev-1">
          <div className="relative aspect-video w-full">
            <HeroPoster positions={positions} progress={posterFrame} placeholderCount={data.placeholderCount} />
          </div>
          <figcaption className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <span className="label-mono text-fg-3">Poster · same frame</span>
            <code className="text-caption text-fg-3">&lt;HeroPoster /&gt;</code>
          </figcaption>
        </figure>
        <Segmented
          size="sm"
          aria-label="Render quality"
          value={quality}
          onValueChange={setQuality}
          options={[
            { value: "auto", label: "Auto" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <Readout className="rounded-panel border border-line-2 bg-elev-1 font-mono text-caption">
          <ReadoutRow label="Mode" value={decision ? `${decision.mode} · ${REASONS[decision.reason]}` : null} />
          <ReadoutRow label="Quality" value={stats ? `${stats.quality}${stats.bloom ? " · bloom" : ""}` : null} />
          <ReadoutRow label="Pixel ratio" value={stats ? stats.dpr.toFixed(2) : null} />
          <ReadoutRow
            label="Frame interval"
            value={stats ? (stats.frameMs ? `${stats.frameMs.toFixed(1)} ms · ${stats.fps} fps` : "idle (on demand)") : null}
          />
          <ReadoutRow label="Frames drawn" value={stats ? String(stats.frames) : null} />
        </Readout>
      </div>
    </div>
  );
}
