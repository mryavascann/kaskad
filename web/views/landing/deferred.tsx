"use client";

/**
 * Below-the-fold landing parts whose JavaScript waits until the reader engages. The server renders
 * them in full (no-JS readers, SEO and the first paint get the real content); in the browser their
 * code is a separate chunk that React hydrates later. Until then the server HTML stays on screen, as
 * React keeps a Suspense boundary's server content while its lazy component loads.
 *
 * The chunks are requested on the first scroll, wheel, touch, pointer or key press, when the page
 * opens scrolled (restored position, `#section` link), or `ENGAGE_FALLBACK_MS` after `load`.
 * Everything they show is below a 330svh scroll scene, so it is always loaded before it is reached.
 */
import { lazy, Suspense, type ComponentType } from "react";

/** Load the deferred parts anyway this long after `load`, if the reader hasn't moved yet. */
export const ENGAGE_FALLBACK_MS = 6000;

const EVENTS = ["scroll", "wheel", "touchstart", "pointerdown", "keydown"] as const;

let gate: Promise<void> | null = null;
let open: (() => void) | null = null;

/** Resolves once the reader engages with the page (see the module comment); at once on the server. */
export function whenEngaged(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (gate) return gate;
  gate = new Promise<void>((resolve) => {
    let timer = 0;
    const listen: AddEventListenerOptions = { passive: true, capture: true };
    const done = () => {
      for (const e of EVENTS) window.removeEventListener(e, done, listen);
      window.removeEventListener("load", later);
      window.clearTimeout(timer);
      open = null;
      resolve();
    };
    const later = () => {
      timer = window.setTimeout(done, ENGAGE_FALLBACK_MS);
    };
    open = done;
    if (window.scrollY > 0 || window.location.hash) return done();
    for (const e of EVENTS) window.addEventListener(e, done, listen);
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
  });
  return gate;
}

/** Opens the gate now (tests, or a caller that knows the parts are needed). */
export function engageNow(): void {
  void whenEngaged();
  open?.();
}

/**
 * A component whose code loads after `whenEngaged()`. The server render is complete; the Suspense
 * boundary keeps that HTML until the chunk arrives (fallback `null` only shows on a client-side
 * navigation, below the fold).
 */
export function deferred<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Lazy = lazy(() =>
    whenEngaged()
      .then(load)
      .then((C) => ({ default: C })),
  );
  function Deferred(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Deferred;
}
