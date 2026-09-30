/**
 * Scroll-scene toolkit.
 *
 * - `observeScrollProgress(el, { start, end }, onChange)`: an element's scroll progress (0 → 1) from
 *   native scroll events, one read per animation frame from cached offsets (no layout reads while
 *   scrolling). No library: this is what the landing's scene runs on.
 * - `whenScrollIntent()`: resolves on the reader's first scroll, wheel, touch, press, key or mouse
 *   move (or at once when the page opens scrolled). Scenes load their heavy parts behind it, so
 *   nothing of theirs runs while the page loads.
 * - `loadScrollKit()`: GSAP + ScrollTrigger as one shared dynamic import, for scenes that need GSAP
 *   timelines. Nothing here imports it at module load; no page uses it at the moment.
 * - `segment(p, from, to)`: a beat of a 0–1 progress.
 */
import type { gsap as Gsap } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";

export type ScrollKit = { gsap: typeof Gsap; ScrollTrigger: typeof ScrollTriggerType };

let kit: Promise<ScrollKit> | null = null;

/** GSAP and ScrollTrigger, imported once (a separate chunk) and registered. */
export function loadScrollKit(): Promise<ScrollKit> {
  kit ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([core, st]) => {
    core.gsap.registerPlugin(st.ScrollTrigger);
    return { gsap: core.gsap, ScrollTrigger: st.ScrollTrigger };
  });
  return kit;
}

/** Test hook: forget the loaded kit (tests mock the modules per file). */
export function resetScrollKit() {
  kit = null;
}

/**
 * Linear sub-range of a 0–1 progress: 0 before `from`, 1 after `to`. Scenes split one scroll
 * progress into beats (copy out, panel in, loop drawn) with it.
 */
export function segment(progress: number, from: number, to: number): number {
  if (to <= from) return progress >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (progress - from) / (to - from)));
}

// ---------------------------------------------------------------------------------------------
// Intent gate

const INTENT_EVENTS = ["scroll", "wheel", "touchstart", "pointerdown", "keydown", "pointermove"] as const;

let intent: Promise<void> | null = null;
let openIntent: (() => void) | null = null;

/**
 * Resolves once the reader engages with the page: the first scroll, wheel, touch, press, key, or
 * mouse move (`pointerType` "mouse" only: a touch's pointermove comes with its touchstart anyway).
 * At once when the page opens scrolled (restored position, `#section` link), after a click or key
 * press in this document (`navigator.userActivation`: a client-side navigation), and on the server.
 * There is no timer: a page that is loaded and left alone runs none of what waits here.
 */
export function whenScrollIntent(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (intent) return intent;
  intent = new Promise<void>((resolve) => {
    const listen: AddEventListenerOptions = { passive: true, capture: true };
    const done = () => {
      for (const e of INTENT_EVENTS) window.removeEventListener(e, onEvent, listen);
      openIntent = null;
      resolve();
    };
    const onEvent = (event: Event) => {
      if (event.type === "pointermove" && (event as PointerEvent).pointerType !== "mouse") return;
      done();
    };
    openIntent = done;
    // Already engaged: the page opened scrolled, or the reader has clicked or typed in this document
    // (a client-side navigation to the page: its lazy parts have no server HTML to keep showing).
    const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (window.scrollY > 0 || window.location.hash || active) return done();
    for (const e of INTENT_EVENTS) window.addEventListener(e, onEvent, listen);
  });
  return intent;
}

/** Opens the intent gate now (reduced motion, tests, a caller that knows the parts are needed). */
export function openScrollIntent(): void {
  void whenScrollIntent();
  openIntent?.();
}

/** Test hook: a fresh, closed gate. */
export function resetScrollIntent(): void {
  intent = null;
  openIntent = null;
}

// ---------------------------------------------------------------------------------------------
// Scroll progress

export type ScrollRange = {
  /** When progress is 0: "<element edge> <viewport edge>", edges `top | center | bottom | N% | Npx`. Default "top top". */
  start?: string;
  /** When progress is 1, same syntax. Default "bottom bottom". */
  end?: string;
};

/** Offset of an edge keyword within a box of `size` px. */
export function edgeOffset(edge: string, size: number): number {
  if (edge === "top") return 0;
  if (edge === "center") return size / 2;
  if (edge === "bottom") return size;
  const n = Number.parseFloat(edge);
  if (!Number.isFinite(n)) return 0;
  return edge.endsWith("%") ? (n / 100) * size : n;
}

/** Document scroll position at which "<element edge> <viewport edge>" line up. */
export function scrollAt(position: string, elementTop: number, elementHeight: number, viewportHeight: number): number {
  const [el = "top", vp = "top"] = position.trim().split(/\s+/);
  return elementTop + edgeOffset(el, elementHeight) - edgeOffset(vp, viewportHeight);
}

/** Progress 0–1 of `scrollY` between two scroll positions. */
export function progressBetween(scrollY: number, from: number, to: number): number {
  if (to <= from) return scrollY >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (scrollY - from) / (to - from)));
}

/**
 * Calls `onChange` with the element's scroll progress now and whenever it changes (at most once per
 * frame). Offsets are measured once and again on resize (element or viewport) and on `load`; a
 * scroll only reads `scrollY`. Returns a stop function.
 */
export function observeScrollProgress(el: HTMLElement, range: ScrollRange, onChange: (progress: number) => void): () => void {
  const { start = "top top", end = "bottom bottom" } = range;
  let from = 0;
  let to = 0;
  let last = Number.NaN;
  let frame = 0;

  const measure = () => {
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    from = scrollAt(start, top, rect.height, window.innerHeight);
    to = scrollAt(end, top, rect.height, window.innerHeight);
  };
  const emit = () => {
    frame = 0;
    const p = progressBetween(window.scrollY, from, to);
    if (p === last) return;
    last = p;
    onChange(p);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(emit);
  };
  const onResize = () => {
    measure();
    onScroll();
  };

  measure();
  emit();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("load", onResize);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
  observer?.observe(el);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("load", onResize);
    observer?.disconnect();
  };
}
