"use client";

/**
 * Demo mode in React. `useDemoMode()` follows `?demo=1` in the address bar; `<DemoModeAttribute />`
 * (mounted once in the root layout) mirrors it as `<html data-demo="1">` for CSS (e.g. a larger
 * cursor for recordings); `useRandom()` hands out a PRNG that is seeded with `DEMO_SEED` in demo mode.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { isDemoMode } from "./demo";
import { DEMO_SEED, mulberry32, randomSeed, type Rng } from "./random";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  // Chromium's Navigation API also reports pushState/replaceState, i.e. Next.js client navigations.
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  navigation?.addEventListener("currententrychange", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    navigation?.removeEventListener("currententrychange", onChange);
  };
}

const getSnapshot = () => isDemoMode(window.location.search);
const getServerSnapshot = () => false;

/** True while the URL carries `?demo=1`. False on the server and during hydration. */
export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Sets `<html data-demo="1">` while demo mode is on. Renders nothing. */
export function DemoModeAttribute(): null {
  const demo = useDemoMode();
  useEffect(() => {
    if (!demo) return;
    const root = document.documentElement;
    root.dataset.demo = "1";
    return () => {
      delete root.dataset.demo;
    };
  }, [demo]);
  return null;
}

/**
 * A stable random source for event handlers and effects: seeded with `DEMO_SEED` in demo mode (the
 * same kicks, noise and picks on every recording), freshly seeded otherwise. Call it outside render.
 */
export function useRandom(): Rng {
  const demo = useDemoMode();
  const source = useRef<{ demo: boolean; next: Rng } | null>(null);
  return useCallback(() => {
    let current = source.current;
    if (!current || current.demo !== demo) {
      current = { demo, next: mulberry32(demo ? DEMO_SEED : randomSeed()) };
      source.current = current;
    }
    return current.next();
  }, [demo]);
}
