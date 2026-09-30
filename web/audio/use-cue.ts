"use client";

/**
 * React side of the sound cues. Pages call `const cue = useCue()` and then `cue("boom")` from an
 * event handler or effect (e.g. when a shock result lands). Nothing plays unless the viewer turned
 * sound on and has interacted with the page.
 */
import { useCallback, useSyncExternalStore } from "react";
import { playCue, type Cue } from "./engine";
import { isSoundEnabled, setSoundEnabled, subscribeSound } from "./store";

export type { Cue } from "./engine";

/** The viewer's sound preference. Always false on the server and during hydration. */
export function useSoundEnabled(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSound, isSoundEnabled, () => false);
  return [on, setSoundEnabled];
}

/** A stable `(cue, volume?) => boolean`; returns whether the cue actually played. */
export function useCue(): (cue: Cue, volume?: number) => boolean {
  return useCallback((cue: Cue, volume?: number) => (isSoundEnabled() ? playCue(cue, volume) : false), []);
}
