"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { fmtUsd } from "@/lib/kaskad/format";

export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const start = previous.current;
    previous.current = value;
    let frame: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const progress = reduced ? 1 : Math.min(1, (now - t0) / 500);
      setShown(start + (value - start) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <span aria-label={fmtUsd(value)}><span aria-hidden="true">{fmtUsd(reduced ? value : shown)}</span></span>;
}
