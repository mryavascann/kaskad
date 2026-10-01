"use client";

/**
 * Magnetic: the wrapped control leans toward a mouse pointer by at most `strength` px and springs
 * back (`spring.soft`) when the pointer leaves. Retargets on every move, never restarts.
 *
 * Desktop only and subtle: off on touch / coarse pointers and under reduced motion, where the child
 * simply sits still. The outer span receives the pointer (its box never moves, so the pull cannot
 * feed back into itself); the inner span carries the transform.
 */
import { m, useSpring } from "motion/react";
import { useEffect, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "./easing";
import { useFinePointer, useShouldReduceMotion } from "./hooks";
import { spring } from "./tokens";

type MagneticProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** One control, typically a primary Button. */
  children: ReactNode;
  /** Maximum travel in px. Default 6. */
  strength?: number;
};

export function Magnetic({ children, strength = 6, className, onPointerMove, onPointerLeave, ...props }: MagneticProps) {
  const fine = useFinePointer();
  const reduce = useShouldReduceMotion();
  const enabled = fine && !reduce && strength > 0;
  const x = useSpring(0, spring.soft);
  const y = useSpring(0, spring.soft);

  // Switched off mid-pull (reduced motion turned on, pointer type changed): settle at rest at once.
  useEffect(() => {
    if (enabled) return;
    x.jump(0);
    y.jump(0);
  }, [enabled, x, y]);

  const pull = (event: PointerEvent<HTMLSpanElement>) => {
    onPointerMove?.(event);
    if (!enabled || event.pointerType === "touch") return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    // Pointer offset from the center, -1…1 per axis, capped to the unit circle.
    let dx = clamp((event.clientX - (box.left + box.width / 2)) / (box.width / 2), -1, 1);
    let dy = clamp((event.clientY - (box.top + box.height / 2)) / (box.height / 2), -1, 1);
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    x.set(dx * strength);
    y.set(dy * strength);
  };

  const release = (event: PointerEvent<HTMLSpanElement>) => {
    onPointerLeave?.(event);
    x.set(0);
    y.set(0);
  };

  return (
    <span
      data-magnetic={enabled ? "on" : "off"}
      className={cn("inline-flex", className)}
      onPointerMove={pull}
      onPointerLeave={release}
      {...props}
    >
      <m.span className="flex w-full" style={{ x, y }}>
        {children}
      </m.span>
    </span>
  );
}
