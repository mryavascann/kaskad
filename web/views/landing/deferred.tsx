"use client";

/**
 * Landing parts whose JavaScript waits until the reader engages. The server renders them in full
 * (no-JS readers, SEO and the first paint get the real content); in the browser their code is a
 * separate chunk that React hydrates later. Until then the server HTML stays on screen, as React
 * keeps a Suspense boundary's server content while its lazy component loads.
 *
 * The chunks are requested on the first scroll, wheel, touch, press, key or mouse move, or at once
 * when the page opens scrolled (restored position, `#section` link): `whenScrollIntent`. There is
 * no timer: a page that loads and is left alone hydrates none of them. Below-the-fold parts sit under
 * a 330svh scroll scene, so they are always loaded before they are reached; the scene's own lazy
 * parts (stage, readouts) only change once the reader scrolls.
 */
import { lazy, Suspense, type ComponentType } from "react";
import { openScrollIntent, whenScrollIntent } from "@/motion/scroll";

/** Resolves once the reader engages with the page (see the module comment); at once on the server. */
export const whenEngaged = whenScrollIntent;

/** Opens the gate now (tests, reduced motion, or a caller that knows the parts are needed). */
export const engageNow = openScrollIntent;

/**
 * A component whose code loads after `whenEngaged()`. The server render is complete; the Suspense
 * boundary keeps that HTML until the chunk arrives (fallback `null` only shows on a client-side
 * navigation).
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
