"use client";

/**
 * The shock scene's live readouts (a lazy chunk, loaded by `scene-islands.tsx` after the reader's
 * first intent): the readout views of `shock-readouts.tsx`, following `sceneBlock` (whole blocks,
 * written by `ShockDriver`). They re-render only when the block changes, at most `steps` times over
 * the scene; the wave counter also plays the wave cues.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useCue, type Cue } from "@/audio/use-cue";
import { useShouldReduceMotion } from "@/motion/hooks";
import type { LandingFinding } from "./data";
import { waveCue } from "./replay";
import { sceneBlock } from "./scene-state";
import { PriceLineView, ReplayStripView, WaveCounterView, type ReadoutProps } from "./shock-readouts";

/** The scene's whole block: `sceneBlock`, or `initial` (the server's first frame) until the driver runs. */
export function useSceneBlock(initial: number): number {
  return useSyncExternalStore(
    sceneBlock.subscribe,
    () => sceneBlock.get() ?? initial,
    () => initial,
  );
}

/** Minimum gap between two booms: scrolling back and forth over the first wave only ticks. */
export const BOOM_GAP_MS = 6000;
/** Block changes this soon after mount are a restored scroll position, not the viewer scrolling. */
const SETTLE_MS = 800;

/** Sound for the scroll replay (a no-op while sound is off, and under reduced motion). */
export function useWaveCues(finding: LandingFinding | null, block: number, enabled = true) {
  const cue = useCue();
  const prev = useRef(block);
  const since = useRef<number | null>(null);
  const lastBoom = useRef(-Infinity);
  useEffect(() => {
    since.current = performance.now();
  }, []);
  useEffect(() => {
    const from = prev.current;
    prev.current = block;
    const now = performance.now();
    if (!enabled || !finding || since.current === null || now - since.current < SETTLE_MS) return;
    let c: Cue | null = waveCue(finding, from, block);
    if (c === "boom") {
      if (now - lastBoom.current < BOOM_GAP_MS) c = "tick";
      else lastBoom.current = now;
    }
    if (c) cue(c);
  }, [finding, block, enabled, cue]);
}

/** Props of a live readout: the view's, with the server's first block instead of the current one. */
export type LiveReadoutProps<P extends { block: number }> = Omit<P, "block"> & { initialBlock: number };

export function WaveCounter({ initialBlock, ...props }: LiveReadoutProps<ReadoutProps>) {
  const block = useSceneBlock(initialBlock);
  useWaveCues(props.finding, block, !useShouldReduceMotion());
  return <WaveCounterView {...props} block={block} />;
}

export function PriceLine({ initialBlock, ...props }: LiveReadoutProps<Omit<ReadoutProps, "book">>) {
  return <PriceLineView {...props} block={useSceneBlock(initialBlock)} />;
}

export function ReplayStrip({ initialBlock, ...props }: LiveReadoutProps<Parameters<typeof ReplayStripView>[0]>) {
  return <ReplayStripView {...props} block={useSceneBlock(initialBlock)} />;
}
