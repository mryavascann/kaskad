"use client";

import { m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { createContext, use, useEffect, useRef } from "react";
import { useShouldReduceMotion } from "@/motion/hooks";
import { duration, easing, toSeconds } from "@/motion/tokens";
import { preloadAnimate, withAnimate } from "./animate";
import { GasGaugeView, type FillProps, type GasGaugeProps } from "./gas-gauge-view";
import { round } from "./geometry";
import { useEnterView } from "./use-enter-view";

export { GAS_GAUGE_COPY, GasGaugeStatic, type GasGaugeCopy, type GasGaugeProps } from "./gas-gauge-view";

/** Gas units drawn so far and the memory bars' progress (0 → 1), for the fills. */
const Progress = createContext<{ drawn: MotionValue<number>; memory: MotionValue<number> } | null>(null);

/** A fill that grows with the gauge's progress (a `scaleX` from 0 to 1 over its own range). */
function LiveFill({ grow, style, ...props }: FillProps) {
  const progress = use(Progress);
  const source = grow.kind === "memory" ? progress!.memory : progress!.drawn;
  const scaleX = useTransform(source, (v) => {
    if (grow.kind === "memory") return v;
    const span = grow.to - grow.from;
    return span > 0 ? round(Math.min(1, Math.max(0, v - grow.from) / span), 4) : 0;
  });
  return <m.span {...props} style={{ ...style, scaleX }} />;
}

/**
 * One engine run against the per-transaction gas ceiling of both chains, on ONE linear scale: the
 * Monad bar (measured) fills and stops under its 30M limit; the Ethereum bar (an estimate, labelled
 * as such) runs into its 16,777,216 cap and, when it does not fit, carries on past it in red. Both
 * bars grow at the same speed when the gauge scrolls into view. Memory below.
 * Markup: `GasGaugeView` (./gas-gauge-view.tsx, shared with the server-only `GasGaugeStatic`).
 */
export function GasGauge(props: GasGaugeProps) {
  const { facts } = props;
  const rootRef = useRef<HTMLElement>(null);
  const entered = useEnterView(rootRef);
  const reduce = useShouldReduceMotion();
  // Load the animation engine after the first paint, so starts below are synchronous by then.
  useEffect(preloadAnimate, []);
  // Gas units drawn so far: both bars grow with it, so they move at the same speed on the same scale.
  const top = facts ? Math.max(facts.monad.gas, facts.ethereum.gasEstimate) : 0;
  const drawn = useMotionValue(top);
  const memory = useMotionValue(1);
  useEffect(() => {
    drawn.jump(top);
  }, [top, drawn]);
  useEffect(() => {
    if (!entered || reduce || !(top > 0)) return;
    drawn.jump(0);
    memory.jump(0);
    const runs = withAnimate((animate) => [
      animate(drawn, top, { duration: toSeconds(duration.sceneLong), ease: easing.outQuart }),
      animate(memory, 1, { duration: toSeconds(duration.scene), ease: easing.outExpo, delay: toSeconds(duration.slow) }),
    ]);
    return () => runs.stop();
  }, [entered, reduce, top, drawn, memory]);

  return (
    <Progress value={{ drawn, memory }}>
      <GasGaugeView {...props} rootRef={rootRef} Fill={LiveFill} />
    </Progress>
  );
}
