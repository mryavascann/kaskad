"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import type { PasskeyKeys } from "@/lib/kaskad/passkey-keys";
import { loadSigner } from "../signer";
import { fetchPosition, walletRisk } from "../wallet";
import {
  EMPTY_WATCHLIST,
  WatchlistError,
  fetchWatchlist,
  removeEntry,
  storeWatchlist,
  upsertEntry,
  watchStatus,
  type WatchStatus,
  type Watchlist,
  type WatchlistErrorCode,
} from "../watchlist";
import { useSigner } from "./useSigner";

export type WatchCheck = { status: WatchStatus | "checking" | "error"; drop: number | null };

type Loaded = { owner: Address; list: Watchlist; error: WatchlistErrorCode | null };

const codeOf = (e: unknown): WatchlistErrorCode => (e instanceof WatchlistError ? e.code : "failed");

/**
 * The signed-in passkey's private watchlist: loaded (and decrypted in the browser) when a Mera passkey
 * signs in, forgotten on sign-out. Edits are saved at once, sealed with the passkey's watchlist key.
 * `checkAll` reads each position (GET /api/position, one at a time) and flags the ones that would be
 * liquidated within their alert drop. Nothing here sends a transaction.
 */
export function useWatchlist() {
  const signer = useSigner();
  const owner = signer.kind === "mera" ? signer.address : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Record<string, WatchCheck>>({});
  const keys = useRef<PasskeyKeys | null>(null);

  useEffect(() => {
    if (!owner) {
      keys.current = null;
      return;
    }
    let live = true;
    void loadSigner()
      .then(async (m) => {
        const k = m.getMeraKeys();
        if (!k) throw new WatchlistError("failed");
        keys.current = k;
        const list = await fetchWatchlist(k);
        if (live) setLoaded({ owner, list, error: null });
      })
      .catch((e) => {
        if (live) setLoaded({ owner, list: EMPTY_WATCHLIST, error: codeOf(e) });
      });
    return () => {
      live = false;
    };
  }, [owner]);

  const current = loaded && loaded.owner === owner ? loaded : null;
  const status: "signed-out" | "loading" | "ready" | "error" = !owner ? "signed-out" : !current ? "loading" : current.error && current.list === EMPTY_WATCHLIST ? "error" : "ready";

  /** Applies an edit, saves it, and rolls back if the save fails. */
  const edit = useCallback(
    async (change: (l: Watchlist) => Watchlist): Promise<boolean> => {
      const k = keys.current;
      if (!k || !current) return false;
      let next: Watchlist;
      try {
        next = change(current.list);
      } catch (e) {
        setLoaded({ ...current, error: codeOf(e) });
        return false;
      }
      setLoaded({ ...current, list: next, error: null });
      setSaving(true);
      try {
        await storeWatchlist(k, next);
        return true;
      } catch (e) {
        setLoaded({ ...current, error: codeOf(e) });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [current],
  );

  const checkAll = useCallback(async () => {
    if (!current) return;
    for (const e of current.list.entries) {
      setChecks((c) => ({ ...c, [e.address]: { status: "checking", drop: c[e.address]?.drop ?? null } }));
      const res = await fetchPosition(e.address);
      const risk = res.ok ? walletRisk(res.position, null, null) : null;
      setChecks((c) => ({
        ...c,
        [e.address]: risk
          ? { status: watchStatus(risk.thresholdState, e.alertDropPct), drop: risk.thresholdState?.kind === "at-drop" ? risk.thresholdState.drop : null }
          : { status: "error", drop: null },
      }));
    }
  }, [current]);

  return {
    status,
    entries: current?.list.entries ?? [],
    error: current?.error ?? null,
    saving,
    checks,
    add: (address: string, alertDropPct: number, label?: string) => edit((l) => upsertEntry(l, { address, alertDropPct, label })),
    remove: (address: string) => edit((l) => removeEntry(l, address)),
    checkAll,
  };
}
