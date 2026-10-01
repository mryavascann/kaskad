"use client";

import { useMotionValue, useMotionValueEvent } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useShouldReduceMotion } from "@/motion/hooks";
import { spring } from "@/motion/tokens";
import { preloadAnimate, withAnimate } from "./animate";
import { HF_TARGET } from "./gauge-model";
import { round } from "./geometry";
import { CX, CY, dialAngle, HealthDialView, REST, type HealthDialProps } from "./health-dial-view";

export { HEALTH_DIAL_COPY, HealthDialStatic, type HealthDialCopy, type HealthDialProps } from "./health-dial-view";

/**
 * Half-circle health-factor gauge: liquidatable under 1, warning up to the target, safe above, on a
 * zone-weighted scale whose ticks carry the real values. The needle is a `spring.needle`: it trembles,
 * then settles, and a new value retargets it mid-swing. `null` → skeleton, `Infinity` → "no debt".
 * Markup: `HealthDialView` (./health-dial-view.tsx, shared with the server-only `HealthDialStatic`).
 */
export function HealthDial(props: HealthDialProps) {
  const { value, target = HF_TARGET } = props;
  const targetAngle = dialAngle(value, target);

  const reduce = useShouldReduceMotion();
  // Load the animation engine after the first paint, so starts below are synchronous by then.
  useEffect(preloadAnimate, []);
  const angle = useMotionValue(targetAngle);
  // The attribute React renders once; afterwards the motion value owns the needle's rotation.
  const [initialAngle] = useState(targetAngle);
  const needleRef = useRef<SVGGElement>(null);
  const shown = useRef(value);
  useMotionValueEvent(angle, "change", (a) => needleRef.current?.setAttribute("transform", `rotate(${round(a, 3)} ${CX} ${CY})`));
  useEffect(() => {
    const previous = shown.current;
    shown.current = value;
    if (previous === value) return;
    // A value that arrives after loading swings in from rest; a changed value retargets mid-swing.
    if (reduce) {
      angle.jump(targetAngle);
      return;
    }
    if (previous === null) angle.jump(REST);
    const controls = withAnimate((animate) => animate(angle, targetAngle, spring.needle));
    return () => controls.stop();
  }, [value, targetAngle, reduce, angle]);

  return <HealthDialView {...props} needle={{ ref: needleRef, angle: initialAngle }} />;
}
