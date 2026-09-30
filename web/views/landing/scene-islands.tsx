"use client";

/**
 * The shock scene's islands: small eager wrappers that show the server-rendered first frame
 * (`children`: server components, no client code) until the reader's first intent, then load the
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
import { createElement, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { whenScrollIntent } from "@/motion/scroll";
import type { HeroPosition } from "@/three/model";
import type { LiveReadoutProps } from "./shock-live";
import type { PriceLineView, ReadoutProps, ReplayStripView } from "./shock-readouts";

/** The component `load` resolves to, once the reader has shown intent; `null` before. */
export function useAfterIntent<P>(load: () => Promise<ComponentType<P>>): ComponentType<P> | null {
  const [C, setC] = useState<ComponentType<P> | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    let cancelled = false;
    void whenScrollIntent()
      .then(() => loader.current())
      .then((next) => {
        if (!cancelled) setC(() => next);
      })
      .catch(() => {
        // The chunk failed to load: the server's first frame stays.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return C;
}

function takeover<P extends object>(load: () => Promise<ComponentType<P>>) {
  function Island({ children, ...props }: P & { children: ReactNode }) {
    const C = useAfterIntent(load);
    // createElement: the component is a loaded module export (stable), not one created during render.
    return C ? createElement(C, props as unknown as P) : children;
  }
  return Island;
}

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
