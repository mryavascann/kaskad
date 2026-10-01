"use client";

/**
 * The nav's live block, split so the server renders the indicator and the client only swaps state:
 * - `LivePoller`: the one poller (`useLiveBlock`) for the whole nav. It starts when the browser is
 *   idle after load, so the first read never competes with hydration, and publishes to a module store.
 * - `NavLiveSwitch`: picks one of the server-rendered indicators (connecting / live / offline).
 * - `LiveBlockValue`: the formatted block number inside the "live" indicator.
 * - `useNavLive()`: the same state for client code (the mobile menu's copy).
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { useLiveBlock, type LiveBlock } from "@/lib/chain/hooks/useLiveBlock";

const INITIAL: LiveBlock = { block: null, updatedAt: null, error: null };
let current: LiveBlock = INITIAL;
const listeners = new Set<() => void>();

function publish(next: LiveBlock) {
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const read = () => current;
const readServer = () => INITIAL;

/** The nav's live block state (initial "connecting" state on the server and during hydration). */
export function useNavLive(): LiveBlock {
  return useSyncExternalStore(subscribe, read, readServer);
}

/** "connecting" | "live" | "offline", the three indicator states. */
export function liveState({ block, error }: LiveBlock): "connecting" | "live" | "offline" {
  if (block !== null) return "live";
  return error !== null ? "offline" : "connecting";
}

function Poll() {
  const live = useLiveBlock();
  useEffect(() => publish(live), [live]);
  return null;
}

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

/** Mount once (the nav does). Starts polling on the first idle period after hydration. */
export function LivePoller() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 1);
    return () => window.clearTimeout(id);
  }, []);
  return ready ? <Poll /> : null;
}

export function NavLiveSwitch({ connecting, live, offline }: { connecting: ReactNode; live: ReactNode; offline: ReactNode }) {
  const state = liveState(useNavLive());
  return state === "live" ? live : state === "offline" ? offline : connecting;
}

export function LiveBlockValue({ locale }: { locale: Locale }) {
  const { block } = useNavLive();
  return block === null ? null : formatters(locale).int(block);
}
