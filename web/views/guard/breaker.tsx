import { cn } from "@/lib/utils";

export type BreakerState = "none" | "armed" | "tripped" | "unknown";

/**
 * Circuit-breaker lever drawn in SVG. Armed: the lever is up and closes the circuit (borrowing flows).
 * Tripped: the lever drops and opens it, in liquidation red. "none" draws a plain wire (market A has no
 * breaker). The lever rotates with the impact easing; under reduced motion it snaps.
 * Decorative: the card states the status in words.
 */
export function Breaker({ state, className }: { state: BreakerState; className?: string }) {
  const tripped = state === "tripped";
  const color = tripped ? "var(--color-liq)" : state === "armed" ? "var(--color-safe)" : "var(--color-fg-3)";
  return (
    <svg viewBox="0 0 120 72" className={cn("h-18 w-30 overflow-visible", className)} aria-hidden>
      {/* Wire in and out */}
      <line x1="4" y1="36" x2="34" y2="36" stroke="var(--color-line-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line x1="86" y1="36" x2="116" y2="36" stroke="var(--color-line-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {state === "none" ? (
        <line x1="34" y1="36" x2="86" y2="36" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <rect x="30" y="18" width="60" height="36" rx="5" fill="var(--color-elev-2)" stroke="var(--color-line-3)" vectorEffect="non-scaling-stroke" />
          <circle cx="38" cy="36" r="2.5" fill={color} />
          <circle cx="82" cy="36" r="2.5" fill={tripped ? "var(--color-fg-4)" : color} />
          <g
            className="origin-[38px_36px] transition-[rotate] duration-(--dur-slow) ease-in-quart motion-reduce:transition-none"
            style={{ rotate: tripped ? "-38deg" : "0deg" }}
          >
            <line x1="38" y1="36" x2="80" y2="36" stroke={color} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
          {tripped && <circle cx="60" cy="36" r="22" fill="none" stroke="var(--color-liq)" strokeOpacity="0.35" className="motion-safe:animate-live" vectorEffect="non-scaling-stroke" />}
        </>
      )}
    </svg>
  );
}
