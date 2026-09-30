/**
 * The per-viewer sound preference. Off unless the viewer turned it on; persisted in localStorage
 * (every access wrapped: private windows and blocked storage just fall back to "off" for next time).
 * Other tabs follow through the `storage` event.
 */

export const SOUND_STORAGE_KEY = "kaskad.sound";

const listeners = new Set<() => void>();
/** In-memory value for this tab; null until read from storage. */
let current: boolean | null = null;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  current ??= readStored();
  return current;
}

export function setSoundEnabled(on: boolean): void {
  current = on;
  try {
    if (on) window.localStorage.setItem(SOUND_STORAGE_KEY, "on");
    else window.localStorage.removeItem(SOUND_STORAGE_KEY);
  } catch {
    // Storage unavailable: the choice holds for this tab only.
  }
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent) {
  if (e.key !== SOUND_STORAGE_KEY && e.key !== null) return;
  current = readStored();
  for (const l of listeners) l();
}

export function subscribeSound(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Tests only: forget the cached value so the next read goes to storage again. */
export function resetSoundStoreForTests(): void {
  current = null;
}
