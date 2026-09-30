import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { spring, type SpringToken } from "@/motion/tokens";

/**
 * Samples a spring (rest → target, zero initial velocity) into a CSS `linear()` easing plus its settle
 * time, so a pure-CSS transition can move like the `motion/tokens` spring without a client component.
 */
export function springEasing(s: SpringToken, samples = 40): { easing: string; ms: number } {
  const w0 = Math.sqrt(s.stiffness / s.mass);
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  const underdamped = zeta < 1;
  const wd = underdamped ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  // Time until the envelope is within 0.1% of the target.
  const settle = -Math.log(0.001) / (Math.min(zeta, 1) * w0);
  const x = (t: number) =>
    underdamped
      ? 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
      : 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const points = Array.from({ length: samples + 1 }, (_, i) => (i === samples ? 1 : Number(x((i / samples) * settle).toFixed(3))));
  return { easing: `linear(${points.join(", ")})`, ms: Math.round(settle * 1000) };
}

// The falling block: resting tilt, tilt on hover (it tips further, overshoots, settles).
const TIP_REST = 14;
const TIP_HOVER = 26;
const tip = springEasing(spring.impact);

const tipVars = {
  "--logo-tip-rest": `${TIP_REST}deg`,
  "--logo-tip-hover": `${TIP_HOVER}deg`,
  "--logo-tip-ease": tip.easing,
  "--logo-tip-ms": `${tip.ms}ms`,
} as CSSProperties;

type LogoMarkProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Rendered size in px (square). Drawn on a 32-unit grid, crisp at 16 and 32. */
  size?: number;
  /** On hover of the mark (or of the enclosing `Logo`), the red block tips further and settles. */
  animated?: boolean;
  /** Accessible name; ignored when `decorative`. */
  title?: string;
  /** Hide from assistive tech (e.g. next to a visible wordmark that already names the product). */
  decorative?: boolean;
};

/**
 * Stepped fall: three blocks stepping down left to right; the last one is red and tipping over like
 * a falling domino. Blocks use `currentColor`; the falling one is always `liq`.
 */
export function LogoMark({ size = 24, animated = false, title = "Kaskad", decorative = false, className, style, ...props }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      overflow="visible"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      data-slot="logo-mark"
      className={cn("group/logo shrink-0", className)}
      style={{ ...tipVars, ...style }}
      {...props}
    >
      {/* Even coordinates on a 32 grid: every edge lands on a whole pixel at 16, 32 and 48 px. */}
      <rect x="0" y="2" width="8" height="26" fill="currentColor" />
      <rect x="10" y="10" width="8" height="18" fill="currentColor" />
      <rect
        x="20"
        y="16"
        width="8"
        height="12"
        data-slot="logo-tip"
        className={cn(
          // Pivot on the bottom-right edge, like a domino.
          "fill-liq rotate-(--logo-tip-rest) origin-[28px_28px] [transform-box:view-box]",
          animated && [
            // Leaving: settle back smoothly. Entering: the spring (overshoot, then rest).
            "transition-[rotate] duration-(--dur-slow) ease-out-quart",
            "motion-safe:group-hover/logo:rotate-(--logo-tip-hover) motion-safe:group-hover/logo:duration-(--logo-tip-ms) motion-safe:group-hover/logo:ease-(--logo-tip-ease)",
          ],
        )}
      />
    </svg>
  );
}

type LogoProps = Omit<ComponentProps<"span">, "children"> & {
  /** Mark size in px; the wordmark scales with it. */
  size?: number;
  animated?: boolean;
  /** Accessible name of the lockup. */
  label?: string;
};

/** Mark + "kaskad" wordmark (Geist 600, tight tracking). Announced once, as "Kaskad". */
export function Logo({ size = 20, animated = false, label = "Kaskad", className, style, ...props }: LogoProps) {
  return (
    <span
      role="img"
      aria-label={label}
      data-slot="logo"
      className={cn("group/logo inline-flex shrink-0 items-center text-fg-1", className)}
      style={{ gap: `${Math.round(size * 0.34)}px`, ...style }}
      {...props}
    >
      <LogoMark size={size} animated={animated} decorative />
      <span
        aria-hidden
        className="font-sans leading-none font-semibold tracking-[-0.04em]"
        style={{ fontSize: `${Math.round(size * 0.98)}px` }}
      >
        kaskad
      </span>
    </span>
  );
}
