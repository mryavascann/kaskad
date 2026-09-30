// Visibility-aware polling for the hooks (no React). The legacy pollers started with
// setTimeout(fn, 0) plus setInterval (GuardPanel.tsx:110-117, Connect.tsx:81-88); this keeps that
// shape, pauses while the tab is hidden, skips a tick while the previous one is still running, and
// never ticks more often than MIN_POLL_MS.

/** RPC budget: no poller runs more often than once per second. */
export const MIN_POLL_MS = 1_000;

/**
 * Calls `tick` on the next task and then every `everyMs` while `doc` is visible. Returns `stop`.
 * When the tab becomes visible again the schedule resumes (immediately if the data is older than
 * one period).
 */
export function pollWhileVisible(
  tick: () => void | Promise<void>,
  everyMs: number,
  doc: Pick<Document, "hidden" | "addEventListener" | "removeEventListener"> | undefined = typeof document !== "undefined"
    ? document
    : undefined,
): () => void {
  const period = Math.max(everyMs, MIN_POLL_MS);
  let first: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = -Infinity;
  let inFlight = false;

  const run = () => {
    if (inFlight) return;
    last = Date.now();
    inFlight = true;
    let pending: void | Promise<void>;
    try {
      pending = tick();
    } catch {
      inFlight = false;
      return;
    }
    Promise.resolve(pending)
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  };
  const stop = () => {
    if (first !== undefined) clearTimeout(first);
    if (timer !== undefined) clearInterval(timer);
    first = timer = undefined;
  };
  const start = () => {
    stop();
    first = setTimeout(
      () => {
        first = undefined;
        run();
        timer = setInterval(run, period);
      },
      Math.max(0, last + period - Date.now()),
    );
  };

  if (!doc) {
    start();
    return stop;
  }
  const onVisibility = () => (doc.hidden ? stop() : start());
  if (!doc.hidden) start();
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
