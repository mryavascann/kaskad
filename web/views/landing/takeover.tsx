"use client";

/**
 * Static-HTML takeover islands. An island is a small eager client wrapper around a static rendering
 * the server made (`children`: server components, no client code of their own). It shows that
 * rendering until the reader's first intent (`whenScrollIntent`), then loads the live component (a
 * separate chunk) and renders it in its place, with the same props. The swap is a client render of
 * the same markup (the static variants share their markup with the live components), not a
 * hydration, so:
 *
 * - the server HTML is in the document and stays on screen through hydration and after it, with or
 *   without JavaScript: nothing depends on a Suspense boundary surviving hydration (React
 *   client-renders a dehydrated boundary, dropping its server HTML for the fallback, when a context
 *   above it changes before it hydrates);
 * - nothing of the live component's code is in the page's initial JavaScript, and it runs only once
 *   the reader engages. There is no timer: a page that loads and is left alone swaps nothing.
 */
import { createElement, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { whenScrollIntent } from "@/motion/scroll";

/** The component `load` resolves to, once the reader has shown intent; `null` before. */
export function useAfterIntent<P>(load: () => Promise<ComponentType<P>>): ComponentType<P> | null {
  const [C, setC] = useState<ComponentType<P> | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    let cancelled = false;
    void whenScrollIntent()
      .then(() => loader.current())
      .then((next) => {
        if (!cancelled) setC(() => next);
      })
      .catch(() => {
        // The chunk failed to load: the static server rendering stays.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return C;
}

/** An island: `children` (the static server rendering) until intent, then the loaded component with the other props. */
export function takeover<P extends object>(load: () => Promise<ComponentType<P>>) {
  function Island({ children, ...props }: P & { children: ReactNode }) {
    const C = useAfterIntent(load);
    // createElement: the component is a loaded module export (stable), not one created during render.
    return C ? createElement(C, props as unknown as P) : children;
  }
  return Island;
}
