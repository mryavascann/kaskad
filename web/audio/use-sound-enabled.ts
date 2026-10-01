"use client";

import { useSyncExternalStore } from "react";
import { isSoundEnabled, setSoundEnabled, subscribeSound } from "./store";

/**
 * The viewer's sound preference. Always false on the server and during hydration. Its own module
 * (store only, no synth) so the nav's sound toggle does not pull the audio engine into every page.
 */
export function useSoundEnabled(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSound, isSoundEnabled, () => false);
  return [on, setSoundEnabled];
}
