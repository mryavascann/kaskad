/**
 * Media and preference hooks shared by the motion primitives. Client-only (import them from
 * "use client" modules). Every hook returns the server value (`false`) during hydration, so markup
 * never mismatches; the real value arrives on the next render.
 */
import { MotionConfigContext, useReducedMotionConfig } from "motion/react";
import { useContext, useSyncExternalStore } from "react";

export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function mediaStore(query: string) {
  const subscribe = (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
  const getSnapshot = () => window.matchMedia(query).matches;
  return { subscribe, getSnapshot };
}

const finePointer = mediaStore(FINE_POINTER_QUERY);
const reducedMotion = mediaStore(REDUCED_MOTION_QUERY);
const getServerSnapshot = () => false;

/** True with a precise, hovering pointer (mouse, trackpad). False on touch screens and on the server. */
export function useFinePointer(): boolean {
  return useSyncExternalStore(finePointer.subscribe, finePointer.getSnapshot, getServerSnapshot);
}

/** The operating system setting alone (ignores MotionConfig). Live: follows changes to the setting. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(reducedMotion.subscribe, reducedMotion.getSnapshot, getServerSnapshot);
}

/**
 * Reduced motion as Motion applies it: the nearest MotionConfig (`"always"`, `"never"`, or `"user"` =
 * the OS setting; `MotionProvider` sets `"user"`). Use it in effects, handlers and to gate effects that
 * only exist after hydration. Do not shape the server markup with it: the server cannot see the OS.
 */
export function useShouldReduceMotion(): boolean {
  return useReducedMotionConfig() ?? false;
}

/**
 * True only when a MotionConfig forces reduced motion (`reducedMotion="always"`, e.g. the /design
 * "Simulate reduced motion" switch). Identical on server and client, so it may shape the first render.
 * The OS setting is covered in CSS instead: `--rise`, `--nudge`, `--enter` collapse to 0px.
 */
export function useForcedReducedMotion(): boolean {
  return useContext(MotionConfigContext).reducedMotion === "always";
}
