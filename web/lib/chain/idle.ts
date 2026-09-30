// Run work once the browser is idle after the first paint, so optional chunks (signer, viem read
// client) do not compete with hydration. No React; returns a cancel function for effects.

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Upper bound on the wait: the callback runs by then even on a busy main thread. */
export const IDLE_TIMEOUT_MS = 2_000;
/** Fallback delay where requestIdleCallback is missing (Safari). */
const FALLBACK_MS = 200;

export function onIdle(fn: () => void, timeoutMs = IDLE_TIMEOUT_MS): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as unknown as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = setTimeout(fn, FALLBACK_MS);
  return () => clearTimeout(t);
}
