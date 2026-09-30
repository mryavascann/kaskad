"use client";

/**
 * Where the app-wide Toaster mounts, without its weight: the root layout renders `<ToasterSlot />`
 * (no sonner import); the real `Toaster` (sonner) is loaded and mounted on the first
 * `requestToaster()`, which `design/ui/toaster.tsx` calls as soon as a page imports it (every
 * `notify` / `toast` caller does). Sonner replays toasts created before its Toaster subscribed.
 */
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import type { ToasterProps } from "sonner";

let requested = false;
const listeners = new Set<() => void>();

/** Mounts the Toaster in the slot (idempotent, client only). */
export function requestToaster(): void {
  if (requested || typeof window === "undefined") return;
  requested = true;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const Toaster = dynamic(() => import("./toaster").then((mod) => mod.Toaster), { ssr: false });

export function ToasterSlot(props: ToasterProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => requested,
    () => false,
  );
  return mounted ? <Toaster {...props} /> : null;
}
