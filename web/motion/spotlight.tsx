"use client";

/**
 * Spotlight: a faint radial glow that follows a mouse pointer across a surface, like a lamp over an
 * instrument panel. The pointer position is written to `--mx` / `--my` once per animation frame
 * (no React state per move); the glow fades in and out with `--dur-base`.
 *
 * Desktop only and subtle: nothing on touch / coarse pointers or under reduced motion. The glow sits
 * behind the children (the container becomes its own stacking context) and never takes the pointer.
 */
import { useEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useFinePointer, useShouldReduceMotion } from "./hooks";

type SpotlightProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "aside" | "figure" | "li";
  /** Glow radius in px. Default 260. */
  size?: number;
  /** Glow opacity at its center, 0–1. Default 0.06 (keep it subtle). */
  intensity?: number;
};

export function Spotlight({ as = "div", size = 260, intensity = 0.06, className, children, ...props }: SpotlightProps) {
  const Tag = as as "div";
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const reduce = useShouldReduceMotion();
  const enabled = fine && !reduce;

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const write = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      element.style.setProperty("--mx", `${Math.round(pointerX - box.left)}px`);
      element.style.setProperty("--my", `${Math.round(pointerY - box.top)}px`);
    };
    const track = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      track(event);
      write();
      element.dataset.spotlight = "on";
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      track(event);
      if (!frame) frame = requestAnimationFrame(write);
      element.dataset.spotlight = "on";
    };
    const onLeave = () => {
      element.dataset.spotlight = "off";
    };

    element.addEventListener("pointerenter", onEnter);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointerenter", onEnter);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
      delete element.dataset.spotlight;
    };
  }, [enabled]);

  return (
    <Tag ref={ref} className={cn("group/spotlight relative isolate", className)} {...props}>
      {enabled && (
        <span
          aria-hidden
          data-spotlight-glow=""
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-(--dur-base) ease-out-quart group-data-[spotlight=on]/spotlight:opacity-100"
          style={{
            background: `radial-gradient(${size}px circle at var(--mx, 50%) var(--my, 50%), oklch(1 0 0 / ${intensity}), transparent 65%)`,
          }}
        />
      )}
      {children}
    </Tag>
  );
}
