/**
 * The shock scene's state, outside React: the scroll progress (0 → 1) and the whole replay block it
 * maps to. `ShockDriver` writes them; the stage and the live readouts (lazy islands) subscribe. The
 * progress changes every scroll frame and never renders React; the block changes at most `steps`
 * times over the scene and is the only thing the readouts re-render on.
 *
 * Module state, written only in the browser (effects and scroll handlers); the server never touches
 * it and renders the first frame from props.
 */
import type { HeroTimeline } from "@/three/data";

type Listener = () => void;

/** A value with change listeners (the stage adapts it to a MotionValue). */
export type Signal<T> = { get(): T; set(value: T): void; subscribe(listener: Listener): () => void };

function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Scroll progress of the scene track (0 → 1). */
export const sceneProgress = signal(0);
/** The whole replay block at the current progress; `null` until the driver runs (readouts show their server block). */
export const sceneBlock = signal<number | null>(null);

/** Whole block at `progress`: `floor(blockAt(timeline, progress))` of three/data, inlined so the eager driver skips the model. */
export function blockAtProgress(timeline: HeroTimeline, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const block = Math.min(timeline.steps, Math.max(0, timeline.startBlock + p * (timeline.endBlock - timeline.startBlock)));
  return Math.floor(block + 1e-9);
}

/** Test hook and driver teardown: back to the first frame. */
export function resetSceneState() {
  sceneProgress.set(0);
  sceneBlock.set(null);
}
