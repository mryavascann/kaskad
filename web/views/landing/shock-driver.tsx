"use client";

/**
 * Drives the server-rendered shock scene from scroll, without React renders: the only client code
 * of the scene that loads with the page (it renders nothing). Until the reader's first intent
 * (`whenScrollIntent`) it does nothing but listen; then it follows the track's scroll progress
 * (`observeScrollProgress`, native scroll events) and per frame writes
 * - the beats as CSS variables on the track (`--intro`, `--panel`, `--loop`),
 * - `data-intro-gone` on the track and the panel's `inert` / `aria-hidden` / `data-visible`, when they flip,
 * - `sceneProgress` (the stage) and `sceneBlock` (the readouts, which re-render per whole block).
 *
 * Reduced motion: no observer; the scene jumps to the final state and the lazy parts load at once
 * (the CSS module stacks the headline, the panel and the strip as a static layout).
 */
import { useEffect } from "react";
import { useShouldReduceMotion } from "@/motion/hooks";
import { observeScrollProgress, openScrollIntent, segment, whenScrollIntent } from "@/motion/scroll";
import type { HeroTimeline } from "@/three/data";
import { BEATS } from "./replay";
import { blockAtProgress, resetSceneState, sceneBlock, sceneProgress } from "./scene-state";

const VARS = ["--intro", "--panel", "--loop"] as const;

/** Writes the scene state for `progress` to the track; returns a function that restores the server state. */
export function sceneWriter(track: HTMLElement, timeline: HeroTimeline | null) {
  const panel = track.querySelector<HTMLElement>("[data-landing-panel]");
  let introGone = false;
  let panelOn = false;
  const setPanel = (on: boolean) => {
    panelOn = on;
    if (!panel) return;
    panel.toggleAttribute("inert", !on);
    panel.toggleAttribute("data-visible", on);
    if (on) panel.removeAttribute("aria-hidden");
    else panel.setAttribute("aria-hidden", "true");
  };
  const write = (p: number) => {
    track.style.setProperty("--intro", (1 - segment(p, ...BEATS.introOut)).toFixed(4));
    track.style.setProperty("--panel", segment(p, ...BEATS.panelIn).toFixed(4));
    track.style.setProperty("--loop", segment(p, ...BEATS.loop).toFixed(4));
    const gone = p >= BEATS.introOut[1];
    if (gone !== introGone) {
      introGone = gone;
      track.toggleAttribute("data-intro-gone", gone);
    }
    const on = p > BEATS.panelIn[0];
    if (on !== panelOn) setPanel(on);
    sceneProgress.set(p);
    if (timeline) sceneBlock.set(blockAtProgress(timeline, p));
  };
  const restore = () => {
    for (const v of VARS) track.style.removeProperty(v);
    track.removeAttribute("data-intro-gone");
    if (panelOn) setPanel(false);
    resetSceneState();
  };
  return { write, restore };
}

export function ShockDriver({ trackId, timeline }: { trackId: string; timeline: HeroTimeline | null }) {
  const reduce = useShouldReduceMotion();

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const { write, restore } = sceneWriter(track, timeline);
    if (reduce) {
      write(1);
      openScrollIntent();
      return restore;
    }
    let cancelled = false;
    let stop: (() => void) | null = null;
    void whenScrollIntent().then(() => {
      if (!cancelled) stop = observeScrollProgress(track, { start: "top top", end: "bottom bottom" }, write);
    });
    return () => {
      cancelled = true;
      stop?.();
      restore();
    };
  }, [trackId, timeline, reduce]);

  return null;
}
