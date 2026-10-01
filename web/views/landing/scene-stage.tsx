"use client";

/**
 * The hero stage inside the shock scene (lazy island, see `scene-islands.tsx`): `HeroStage` fed
 * with the scene's scroll progress. The progress reaches it as a MotionValue that mirrors
 * `sceneProgress` from mount on, so it reads 0 while React hydrates the server-rendered poster
 * (the poster's first frame always matches the server HTML), then follows the scroll without React
 * renders.
 *
 * Where the stage keeps the SVG poster instead of the WebGL scene (software GL, low-end devices,
 * data saver), the poster follows the readouts: it is redrawn once per whole block (`sceneBlock`, at
 * most `steps` renders over the scene), at the end of that block, so the row never shows more (or
 * less) than the strip under it says. Under reduced motion the driver jumps to the last block, so
 * the poster shows the final state.
 */
import { motionValue } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { HeroModeDecision } from "@/three/capability";
import { progressAtBlock, type HeroTimeline } from "@/three/data";
import { HeroStage } from "@/three/hero-stage";
import type { HeroPosition } from "@/three/model";
import { sceneBlock, sceneProgress } from "./scene-state";

/**
 * Poster progress for a whole replay block: the end of the block (all of its tips started), 0 before
 * the shock, and 1 (every fall settled) in the last block.
 */
export function posterProgressAt(timeline: HeroTimeline, block: number | null): number {
  if (block === null || block <= 0) return 0;
  if (block >= timeline.steps) return 1;
  return Math.min(1, Math.max(0, progressAtBlock(timeline, block + 1)));
}

const noop = () => () => {};

export function SceneStage({
  positions,
  placeholderCount,
  timeline,
}: {
  positions?: readonly HeroPosition[] | null;
  placeholderCount: number;
  timeline?: HeroTimeline | null;
}) {
  const [progress] = useState(() => motionValue(0));
  const [posterOnly, setPosterOnly] = useState(false);
  useEffect(() => {
    progress.set(sceneProgress.get());
    return sceneProgress.subscribe(() => progress.set(sceneProgress.get()));
  }, [progress]);
  // Only a poster-only stage re-renders per block; the WebGL scene follows `progress` without renders.
  const block = useSyncExternalStore(
    posterOnly ? sceneBlock.subscribe : noop,
    () => sceneBlock.get(),
    () => null,
  );
  const posterProgress = timeline ? posterProgressAt(timeline, block) : 1;
  return (
    <HeroStage
      className="absolute inset-0"
      positions={positions}
      progress={progress}
      placeholderCount={placeholderCount}
      posterProgress={posterProgress}
      onModeChange={(d: HeroModeDecision) => setPosterOnly(d.mode === "poster")}
    />
  );
}
