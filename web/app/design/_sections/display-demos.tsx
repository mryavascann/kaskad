"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/design/ui/button";
import { HonestyTag } from "@/design/ui/honesty";
import { Label } from "@/design/ui/label";
import { Metric, MetricGroup, type MetricFormat } from "@/design/ui/metric";
import { Steps, type Step } from "@/design/ui/steps";
import { notify, toast } from "@/design/ui/toaster";
import type { Tone } from "@/design/ui/tone";
import { cn } from "@/lib/utils";

const usdCompact: MetricFormat = {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};

export type DemoAsset = { id: number; symbol: string; debtUsd: number; collateralUsd: number; realPositions: number; ethereum: boolean };

const CYCLE_MS = 2600;

/** Cycles real per-asset numbers from the deployment snapshot to show NumberFlow retargeting. */
export function MetricCycleDemo({ assets }: { assets: DemoAsset[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!playing || loading) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % assets.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [playing, loading, assets.length]);

  const asset = assets[index];
  const value = (n: number) => (loading ? null : n);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Asset" className="flex min-w-0 flex-wrap gap-1.5">
          {assets.map((a, i) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={i === index}
              onClick={() => {
                setIndex(i);
                setPlaying(false);
              }}
              className={cn(
                "label-mono h-7 rounded-tag border px-2 transition-[background-color,border-color,color] duration-(--dur-fast) ease-out-quart",
                i === index ? "border-line-strong bg-elev-3 text-fg-1" : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg-1",
              )}
            >
              {a.symbol.replace(" (Ethereum)", " · ETH")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" aria-pressed={loading} onClick={() => setLoading((l) => !l)} className="aria-pressed:bg-elev-2 aria-pressed:text-fg-1">
            Loading state
          </Button>
          <Button size="sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause cycling" : "Resume cycling"}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {playing ? "Pause" : "Play"}
          </Button>
        </div>
      </div>

      <MetricGroup>
        <div className="grid min-w-0 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Metric
            size="xl"
            label={`Debt · ${asset.symbol}`}
            tag={<HonestyTag kind="real">{asset.ethereum ? "Real book · Aave Ethereum" : "Real book · Aave Monad"}</HonestyTag>}
            value={value(asset.debtUsd)}
            format={usdCompact}
            skeletonChars={7}
            caption="Debt backed by this collateral · deployment snapshot"
          />
          <div className="grid grid-cols-2 gap-6 self-end">
            <Metric size="md" label="Collateral" value={value(asset.collateralUsd)} format={usdCompact} skeletonChars={7} />
            <Metric size="md" label="Positions" value={value(asset.realPositions)} skeletonChars={3} />
          </div>
        </div>
      </MetricGroup>
    </div>
  );
}

type ToastSample = { tone: Tone; word: string; title: string; description: string };

const samples: ToastSample[] = [
  { tone: "neutral", word: "Neutral", title: "Preview is free", description: "Runs as eth_call · nothing is signed or sent" },
  { tone: "calm", word: "Calm", title: "Realistic oracle mode", description: "The oracle follows the Maple rate" },
  { tone: "warn", word: "Warn", title: "Worst-case oracle mode", description: "The oracle follows the pool price" },
  { tone: "liq", word: "Liq", title: "Transaction reverted", description: "BorrowIsPaused · market B is paused by the guard" },
  { tone: "safe", word: "Safe", title: "Confirmed on Monad testnet", description: "Receipt received · see it on MonadScan" },
  { tone: "monad", word: "Monad", title: "Burner wallet ready", description: "Testnet MON for gas, paid by the sponsor" },
];

/** Fires one toast per tone into the root Toaster (app/layout.tsx). */
export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      {samples.map((s) => (
        <Button key={s.tone} size="sm" onClick={() => notify(s.title, { tone: s.tone, description: s.description })}>
          {s.word}
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          toast.promise(new Promise((resolve) => window.setTimeout(resolve, 1800)), {
            loading: "Sending transaction",
            success: "Confirmed",
            error: "Reverted",
            description: "Illustration: resolves after a timer, no transaction is sent",
          })
        }
      >
        Promise
      </Button>
    </div>
  );
}

const flow = ["Preparing burner wallet", "Sending", "Confirmed"] as const;

/** Replays a transaction's steps on a timer (illustration only: nothing is sent). */
export function StepsReplayDemo() {
  const [at, setAt] = useState(-1);
  const [fail, setFail] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const run = (withError: boolean) => {
    timers.current.forEach(window.clearTimeout);
    setFail(withError);
    setAt(0);
    timers.current = [1, 2, 3].map((n) => window.setTimeout(() => setAt(n), n * 1100));
  };

  const steps: Step[] = flow.map((label, i) => {
    const errorHere = fail && i === 1 && at >= 2;
    let status: Step["status"] = at > i ? "done" : at === i ? "active" : "pending";
    if (errorHere) status = "error";
    if (fail && i === 2) status = "pending";
    return {
      id: label,
      label,
      status,
      detail: errorHere ? "Transaction reverted: BorrowIsPaused" : undefined,
    };
  });

  return (
    <div className="flex w-full flex-col gap-5">
      <Steps steps={steps} aria-label="Transaction progress (replay)" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => run(false)}>
          Replay
        </Button>
        <Button size="sm" variant="alarm" onClick={() => run(true)}>
          Replay with revert
        </Button>
        <Label className="ml-auto">Illustration · nothing is sent</Label>
      </div>
    </div>
  );
}
