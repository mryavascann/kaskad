"use client";

/**
 * Interactive demos for the /design Charts section. Data arrives as props from the server section
 * (recorded previews, replayed offline); nothing here invents a number.
 */
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLiveBlock } from "@/lib/chain/hooks/useLiveBlock";
import { Button } from "@/design/ui/button";
import { Segmented } from "@/design/ui/segmented";
import { useShouldReduceMotion } from "@/motion/hooks";
import { BlockPulse } from "@/viz/block-pulse";
import { HealthDial } from "@/viz/health-dial";
import { PositionRings } from "@/viz/position-rings";
import { PositionTiles, type PositionsInput } from "@/viz/position-tiles";
import type { TimelineInput } from "@/viz/timeline-model";
import { WaveTimeline } from "@/viz/wave-timeline";

export type ReplayRun = {
  id: string;
  label: string;
  /** "Recorded preview, block N" and the scenario in words. */
  source: string;
  shock: number;
  timeline: TimelineInput;
  positions: PositionsInput;
};

/** Replay speed of the demo: one block per beat of `duration.slow` (a UI choice, not chain time). */
const BLOCK_MS = 420;

/** One step drives the timeline, the tiles and the rings: scrub, or press Play. */
export function ReplayDemo({ runs }: { runs: readonly ReplayRun[] }) {
  const [runId, setRunId] = useState(runs[0].id);
  const run = runs.find((r) => r.id === runId) ?? runs[0];
  const steps = run.timeline.points.length - 1;
  const [step, setStep] = useState(steps);
  const [playing, setPlaying] = useState(false);
  const reduce = useShouldReduceMotion();
  const prices = run.timeline.points.map((p) => p.price);

  // Playing stops by itself at the last block.
  const running = playing && step < steps;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setStep((s) => Math.min(steps, s + 1)), BLOCK_MS);
    return () => clearInterval(id);
  }, [running, steps]);

  const play = () => {
    if (step >= steps) setStep(0);
    setPlaying(true);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Segmented
          aria-label="Recorded run"
          size="sm"
          value={runId}
          onValueChange={(next) => {
            const nextRun = runs.find((r) => r.id === next) ?? runs[0];
            setRunId(next);
            setPlaying(false);
            setStep(nextRun.timeline.points.length - 1);
          }}
          options={runs.map((r) => ({ value: r.id, label: r.label }))}
          className="w-full lg:max-w-2xl"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => (running ? setPlaying(false) : play())}>
            {running ? <Pause aria-hidden /> : <Play aria-hidden />}
            {running ? "Pause" : step >= steps ? "Replay" : "Play"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPlaying(false);
              setStep(0);
            }}
          >
            <RotateCcw aria-hidden />
            Block 0
          </Button>
        </div>
      </div>
      <p className="-mt-4 text-caption text-fg-3">
        {run.source}
        {reduce ? " · reduced motion: steps without tweening" : ""}
      </p>

      <WaveTimeline
        timeline={run.timeline}
        step={step}
        onStepChange={(s) => {
          setPlaying(false);
          setStep(s);
        }}
      />

      <div className="grid gap-10 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start">
        <PositionRings classification={run.positions} shock={run.shock} step={step} steps={steps} prices={prices} table={false} />
        <div className="flex min-w-0 flex-col gap-8">
          <PositionTiles classification={run.positions} step={step} steps={steps} prices={prices} />
          <PositionTiles classification={run.positions} step={step} steps={steps} prices={prices} weight="debt" table={false} />
        </div>
      </div>
    </div>
  );
}

export type DialReading = { label: string; value: number | null; caption: string };

/** Switch between real readings: the needle retargets mid-swing (spring.needle). */
export function HealthDialDemo({ readings }: { readings: readonly DialReading[] }) {
  const [i, setI] = useState(0);
  const reading = readings[i];
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <HealthDial value={reading.value} caption={reading.caption} />
      <Segmented
        aria-label="Reading"
        size="sm"
        value={String(i)}
        onValueChange={(v) => setI(Number(v))}
        options={readings.map((r, k) => ({ value: String(k), label: r.label }))}
        className="w-full max-w-md"
      />
    </div>
  );
}

/** The live Monad testnet block (eth_blockNumber through /api/rpc, every 3 s while visible). */
export function LiveBlockDemo() {
  const { block, error } = useLiveBlock();
  return <BlockPulse block={block} error={error ? error.code : undefined} />;
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="text-caption text-fg-3">{children}</p>;
}
