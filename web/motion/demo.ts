/**
 * Demo mode: `?demo=1` switches every scene to deterministic playback for video capture (seeded
 * randomness with `DEMO_SEED`, fixed timings, larger cursor). This module is pure and safe on the
 * server; the React hook and the <html data-demo> attribute live in `motion/demo-mode.ts`.
 */

export const DEMO_PARAM = "demo";

const ON = new Set(["", "1", "true", "on", "yes"]);

/**
 * True when the query string turns demo mode on: `?demo=1` (also `?demo`, `?demo=true`).
 * Without an argument it reads `window.location.search` (and returns false on the server).
 */
export function isDemoMode(search?: string): boolean {
  const query = search ?? (typeof window === "undefined" ? "" : window.location.search);
  const value = new URLSearchParams(query).get(DEMO_PARAM);
  return value !== null && ON.has(value.trim().toLowerCase());
}
