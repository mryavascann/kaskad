/**
 * Test doubles for the motion primitives (jsdom). Install them at the top of a test file, before
 * the first render: Motion caches its reduced-motion listener and its IntersectionObservers per file.
 */
import { vi } from "vitest";

type MediaState = { reduce: boolean; fine: boolean };

/**
 * A controllable `matchMedia`: `(prefers-reduced-motion…)` follows `reduce`, `(… pointer: fine)`
 * follows `fine`. `set()` changes the state and fires "change" to every listener (Motion's included).
 */
export function mockMatchMedia(initial: Partial<MediaState> = {}) {
  const state: MediaState = { reduce: false, fine: true, ...initial };
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      if (query.includes("reduced-motion")) return state.reduce;
      if (query.includes("pointer: fine")) return state.fine;
      return false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => false,
  }));
  return {
    set(next: Partial<MediaState>) {
      Object.assign(state, next);
      for (const listener of [...listeners]) listener();
    },
  };
}

/** An IntersectionObserver whose entries the test decides: `intersect()` puts everything observed in view. */
export function mockIntersectionObserver() {
  const instances = new Set<{ callback: IntersectionObserverCallback; targets: Set<Element>; observer: IntersectionObserver }>();

  class ObserverDouble implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin: string;
    readonly scrollMargin = "0px";
    readonly thresholds: readonly number[];
    private readonly record: { callback: IntersectionObserverCallback; targets: Set<Element>; observer: IntersectionObserver };

    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      this.rootMargin = options.rootMargin ?? "0px";
      this.thresholds = [options.threshold ?? 0].flat();
      this.record = { callback, targets: new Set(), observer: this };
      instances.add(this.record);
    }
    observe(target: Element) {
      this.record.targets.add(target);
    }
    unobserve(target: Element) {
      this.record.targets.delete(target);
    }
    disconnect() {
      this.record.targets.clear();
    }
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", ObserverDouble);

  return {
    /** Reports every observed element as entering (or, with `false`, leaving) the viewport. */
    intersect(isIntersecting = true) {
      for (const { callback, targets, observer } of instances) {
        const entries = [...targets].map((target) => {
          const box = target.getBoundingClientRect();
          return {
            target,
            isIntersecting,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: box,
            intersectionRect: box,
            rootBounds: null,
            time: performance.now(),
          } as IntersectionObserverEntry;
        });
        if (entries.length) callback(entries, observer);
      }
    },
  };
}
