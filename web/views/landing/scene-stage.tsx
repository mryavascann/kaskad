"use client";

/**
 * The hero stage inside the shock scene (lazy island, see `scene-islands.tsx`): `HeroStage` fed
 * with the scene's scroll progress. The progress reaches it as a MotionValue that mirrors
 * `sceneProgress` from mount on, so it reads 0 while React hydrates the server-rendered poster
 * (the poster's first frame always matches the server HTML), then follows the scroll without React
 * renders.
 */
import { motionValue } from "motion/react";
import { useEffect, useState } from "react";
import { HeroStage } from "@/three/hero-stage";
import type { HeroPosition } from "@/three/model";
import { sceneProgress } from "./scene-state";

export function SceneStage({ positions, placeholderCount }: { positions?: readonly HeroPosition[] | null; placeholderCount: number }) {
  const [progress] = useState(() => motionValue(0));
  useEffect(() => {
    progress.set(sceneProgress.get());
    return sceneProgress.subscribe(() => progress.set(sceneProgress.get()));
  }, [progress]);
  return <HeroStage className="absolute inset-0" positions={positions} progress={progress} placeholderCount={placeholderCount} />;
}
