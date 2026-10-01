"use client";

/**
 * When the console's secondary islands mount. The server renders their first frame; their live code
 * (signer reads, the proof flow) waits so that hydration, the first seconds of the main thread and the
 * RPC belong to the scenario and its result:
 *
 * - `"intent"`: the reader's first scroll, touch, press, key or mouse move (`whenScrollIntent`).
 * - `"idle"`: that, or the browser's next idle period. Idle islands take turns (one idle callback each,
 *   in mount order), so their renders land in separate tasks instead of one long one.
 */
import { useEffect, useState } from "react";
import { onIdle } from "@/lib/chain/idle";
import { whenScrollIntent } from "@/motion/scroll";

/** Upper bound on an idle island's wait on a main thread that never goes idle. */
export const IDLE_MOUNT_TIMEOUT_MS = 8_000;

let queue: Promise<void> = Promise.resolve();

/** Resolves on this caller's turn: the idle callback after the previous caller's. */
function idleTurn(): Promise<void> {
  const turn = queue.then(() => new Promise<void>((resolve) => void onIdle(resolve, IDLE_MOUNT_TIMEOUT_MS)));
  queue = turn;
  return turn;
}

/** False on the server and during hydration; true once the gate opens (then stays true). */
export function useMountGate(mode: "idle" | "intent"): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    const go = () => {
      if (live) setOpen(true);
    };
    void whenScrollIntent().then(go);
    if (mode === "idle") void idleTurn().then(go);
    return () => {
      live = false;
    };
  }, [mode]);
  return open;
}

/**
 * The value `load` resolves to (a component from a lazily imported module), once `when` has turned
 * true; null before, and if the chunk fails to load (the stand-in stays).
 */
export function useLoadedWhen<T>(when: boolean, load: () => Promise<T>): T | null {
  const [value, setValue] = useState<{ v: T } | null>(null);
  useEffect(() => {
    if (!when) return;
    let live = true;
    load().then(
      (v) => {
        if (live) setValue({ v });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [when, load]);
  return value ? value.v : null;
}
