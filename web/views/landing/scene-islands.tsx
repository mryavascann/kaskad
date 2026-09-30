"use client";

/**
 * The shock scene's islands (see `takeover.tsx`): small eager wrappers that show the server-rendered
 * first frame (`children`: server components, no client code) until the reader's first intent, then load the
 * live component (a separate chunk) and render it in its place. The swap is a client render of the
 * same markup, not a hydration: nothing of the scene's code runs while the page loads, and the
 * server HTML never depends on a Suspense boundary surviving hydration (React client-renders a
 * dehydrated boundary, i.e. drops its server HTML, when a context above it changes first).
 *
 * - `LiveStage`: the stage (`HeroStage`: poster, then the WebGL scene). The server renders the
 *   poster's first frame beside it (`HeroPoster`); once the live stage is on screen that static
 *   poster is hidden (same frame, same pixels underneath).
 * - `LiveWaveCounter`, `LivePriceLine`, `LiveReplayStrip`: the readouts, per whole block.
 */
import { createElement, useLayoutEffect, useRef } from "react";
import type { HeroPosition } from "@/three/model";
import type { LiveReadoutProps } from "./shock-live";
import type { PriceLineView, ReadoutProps, ReplayStripView } from "./shock-readouts";
import { takeover, useAfterIntent } from "./takeover";

export const LiveWaveCounter = takeover<LiveReadoutProps<ReadoutProps>>(() => import("./shock-live").then((m) => m.WaveCounter));
export const LivePriceLine = takeover<LiveReadoutProps<Parameters<typeof PriceLineView>[0]>>(() => import("./shock-live").then((m) => m.PriceLine));
export const LiveReplayStrip = takeover<LiveReadoutProps<Parameters<typeof ReplayStripView>[0]>>(() => import("./shock-live").then((m) => m.ReplayStrip));

type StageProps = { positions?: readonly HeroPosition[] | null; placeholderCount: number };

/** Mounts the live stage after intent, over the server's static poster (its previous sibling), and hides that poster. */
export function LiveStage(props: StageProps) {
  const Stage = useAfterIntent<StageProps>(() => import("./scene-stage").then((m) => m.SceneStage));
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const poster = root.current?.previousElementSibling;
    if (!Stage || !poster) return;
    poster.setAttribute("hidden", "");
    return () => poster.removeAttribute("hidden");
  }, [Stage]);
  if (!Stage) return null;
  return (
    <div ref={root} className="absolute inset-0">
      {createElement(Stage, props)}
    </div>
  );
}
