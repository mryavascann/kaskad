// Private watchlist: Monad mainnet addresses the reader follows, each with an alert drop (in % of the
// dominant collateral's price). Sealed in the browser with the passkey's watchlist key and stored under
// the passkey's anonymous id (lib/kaskad/passkey-keys.ts, app/api/watchlist). Read-only lookups, no tx.

import { getAddress, type Address } from "viem";
import { open, seal, type PasskeyKeys, type SealedBlob } from "@/lib/kaskad/passkey-keys";
import { isAddressLoose } from "./units";
import type { ThresholdState } from "./wallet";

export const WATCHLIST_MAX = 20;
export const ALERT_DROP_PCT = { min: 1, max: 50, default: 5 } as const;
const LABEL_MAX = 40;

export type WatchEntry = { address: Address; alertDropPct: number; label?: string };
export type Watchlist = { v: 1; entries: WatchEntry[] };
export const EMPTY_WATCHLIST: Watchlist = { v: 1, entries: [] };

export type WatchlistErrorCode = "unconfigured" | "rate-limited" | "forbidden" | "full" | "invalid-address" | "failed";
export class WatchlistError extends Error {
  constructor(readonly code: WatchlistErrorCode) {
    super(code);
  }
}

const clampPct = (n: number) => Math.min(ALERT_DROP_PCT.max, Math.max(ALERT_DROP_PCT.min, Math.round(n * 10) / 10));

/** Validates a decrypted watchlist (it came from storage: treat it as untrusted). */
export function parseWatchlist(x: unknown): Watchlist {
  const raw = x as { v?: unknown; entries?: unknown } | null;
  if (!raw || raw.v !== 1 || !Array.isArray(raw.entries)) return EMPTY_WATCHLIST;
  const entries: WatchEntry[] = [];
  for (const e of raw.entries.slice(0, WATCHLIST_MAX)) {
    const r = e as { address?: unknown; alertDropPct?: unknown; label?: unknown };
    if (typeof r.address !== "string" || !isAddressLoose(r.address) || typeof r.alertDropPct !== "number" || !Number.isFinite(r.alertDropPct)) continue;
    const address = getAddress(r.address);
    if (entries.some((x) => x.address === address)) continue;
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, LABEL_MAX) : undefined;
    entries.push({ address, alertDropPct: clampPct(r.alertDropPct), ...(label ? { label } : {}) });
  }
  return { v: 1, entries };
}

/** Adds an address, or updates its alert / label when it is already on the list. */
export function upsertEntry(list: Watchlist, entry: { address: string; alertDropPct: number; label?: string }): Watchlist {
  if (!isAddressLoose(entry.address)) throw new WatchlistError("invalid-address");
  const address = getAddress(entry.address);
  const next: WatchEntry = { address, alertDropPct: clampPct(entry.alertDropPct), ...(entry.label?.trim() ? { label: entry.label.trim().slice(0, LABEL_MAX) } : {}) };
  const i = list.entries.findIndex((e) => e.address === address);
  if (i >= 0) return { v: 1, entries: list.entries.map((e, j) => (j === i ? next : e)) };
  if (list.entries.length >= WATCHLIST_MAX) throw new WatchlistError("full");
  return { v: 1, entries: [...list.entries, next] };
}

export const removeEntry = (list: Watchlist, address: string): Watchlist => ({
  v: 1,
  entries: list.entries.filter((e) => e.address.toLowerCase() !== address.toLowerCase()),
});

const errorFor = (status: number): WatchlistErrorCode =>
  status === 503 ? "unconfigured" : status === 429 ? "rate-limited" : status === 403 ? "forbidden" : "failed";

/** The stored list for this passkey (empty when none was saved yet). */
export async function fetchWatchlist(keys: PasskeyKeys, fetchImpl: typeof fetch = fetch): Promise<Watchlist> {
  const res = await fetchImpl(`/api/watchlist?id=${keys.id}`, { cache: "no-store" });
  if (res.status === 404) return EMPTY_WATCHLIST;
  if (!res.ok) throw new WatchlistError(errorFor(res.status));
  const { blob } = (await res.json()) as { blob: SealedBlob };
  try {
    return parseWatchlist(await open(keys.encrypt, blob));
  } catch {
    throw new WatchlistError("failed");
  }
}

/** Seals the list in the browser and stores the ciphertext. */
export async function storeWatchlist(keys: PasskeyKeys, list: Watchlist, fetchImpl: typeof fetch = fetch): Promise<void> {
  const blob = await seal(keys.encrypt, list);
  const res = await fetchImpl("/api/watchlist", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: keys.id, token: keys.writeToken, blob }),
  });
  if (!res.ok) throw new WatchlistError(errorFor(res.status));
}

/** In-app alert for one entry: the position liquidates within the reader's alert drop. */
export type WatchStatus = "alert" | "ok" | "liquidatable-now" | "no-debt";
export function watchStatus(threshold: ThresholdState | null, alertDropPct: number): WatchStatus {
  if (!threshold) return "no-debt";
  if (threshold.kind === "never") return "ok";
  if (threshold.kind === "liquidatable-now") return "liquidatable-now";
  return threshold.drop * 100 <= alertDropPct ? "alert" : "ok";
}
