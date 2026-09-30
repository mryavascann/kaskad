import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneText, type Tone } from "./tone";

const lineColor: Record<Tone, string> = {
  neutral: "border-fg-3",
  calm: "border-calm",
  warn: "border-warn",
  liq: "border-liq",
  safe: "border-safe",
  monad: "border-monad",
};

const rulerHeight = { sm: "h-3", md: "h-5", lg: "h-8" } as const;

/** Viewbox height; x runs in tick units (0 … count-1) and is stretched to the width. */
const H = 100;

/**
 * Container widths (rem) below which a label may drop out, as literal classes so Tailwind emits them.
 * Labels thin out in two steps on narrow rulers: every other one first, then down to every fourth.
 */
const THIN = [
  [10, "@max-[10rem]:hidden"],
  [12, "@max-[12rem]:hidden"],
  [14, "@max-[14rem]:hidden"],
  [16, "@max-[16rem]:hidden"],
  [18, "@max-[18rem]:hidden"],
  [20, "@max-[20rem]:hidden"],
  [22, "@max-[22rem]:hidden"],
  [24, "@max-[24rem]:hidden"],
  [26, "@max-[26rem]:hidden"],
  [28, "@max-[28rem]:hidden"],
  [30, "@max-[30rem]:hidden"],
  [32, "@max-[32rem]:hidden"],
  [36, "@max-[36rem]:hidden"],
  [40, "@max-[40rem]:hidden"],
  [44, "@max-[44rem]:hidden"],
  [48, "@max-[48rem]:hidden"],
  [56, "@max-[56rem]:hidden"],
  [64, "@max-[64rem]:hidden"],
  [72, "@max-[72rem]:hidden"],
  [80, "@max-[80rem]:hidden"],
] as const;

const hideBelow = (rem: number) => (THIN.find(([w]) => w >= rem) ?? THIN[THIN.length - 1])[1];

/** Mono label: ~0.53rem per character (0.6em advance + 0.16em tracking at 11px) plus a 1rem gap. */
const slotRem = (chars: number) => chars * 0.53 + 1;

export type TickRulerHighlight = { index: number; label?: ReactNode; tone?: Tone };

type TickRulerProps = Omit<ComponentProps<"div">, "children"> & {
  /** Number of ticks (e.g. 21 blocks: 0 … 20). */
  count: number;
  /** Every n-th tick is major (taller, brighter, labelled). */
  major?: number;
  /**
   * One label per major tick, in order, or a function of the tick index (called for major ticks).
   * On narrow rulers labels thin out (first and last always stay), so they never collide.
   */
  labels?: ReactNode[] | ((index: number) => ReactNode);
  /** Marker line at a tick index (fractions allowed), optionally with a label above the ruler. */
  highlight?: number | TickRulerHighlight;
  /** Accessible description. Without it the ruler is decorative. */
  label?: string;
  size?: keyof typeof rulerHeight;
};

/**
 * Instrument axis. The SVG stretches (`preserveAspectRatio="none"`) but strokes stay 1px
 * (`non-scaling-stroke`); text is HTML, positioned in %, so it never stretches.
 */
export function TickRuler({ count, major = 5, labels, highlight, label, size = "md", className, ...props }: TickRulerProps) {
  const n = Math.max(2, Math.floor(count));
  const span = n - 1;
  const every = Math.max(1, Math.floor(major));
  const majors = Array.from({ length: Math.floor(span / every) + 1 }, (_, k) => k * every);

  let minorPath = "";
  let majorPath = "";
  for (let i = 0; i < n; i++) {
    if (i % every === 0) majorPath += `M${i} ${H}V0`;
    else minorPath += `M${i} ${H}V${H * 0.5}`;
  }

  const mark = typeof highlight === "number" ? { index: highlight } : highlight;
  const pct = (i: number) => (Math.min(Math.max(i, 0), span) / span) * 100;

  const tickLabels = labels
    ? majors.map((index, k) => ({ index, k, content: typeof labels === "function" ? labels(index) : labels[k] }))
    : [];
  const shown = tickLabels.filter(({ content }) => content !== undefined && content !== null && content !== false);
  const last = shown.length - 1;
  const longest = Math.max(1, ...shown.map(({ content }) => (typeof content === "string" || typeof content === "number" ? String(content).length : 4)));
  // Width the ruler needs to show every label side by side, then every other one.
  const all = (last > 0 ? last : 1) * slotRem(longest);
  const [thinHalf, thinQuarter] = [hideBelow(all), hideBelow(all / 2)];
  const thinning = (j: number) => {
    if (j === 0 || j === last) return undefined;
    // Keep the even ones; if the last label is odd, its even neighbour goes instead of it.
    if (j % 2 === 1 || (last % 2 === 1 && j === last - 1)) return thinHalf;
    if (j % 4 !== 0 || last - j < 2) return thinQuarter;
    return undefined;
  };

  const markPct = mark ? pct(mark.index) : 0;

  return (
    <div
      data-slot="tick-ruler"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("@container grid min-w-0 grid-cols-1", className)}
      {...props}
    >
      {mark?.label && (
        <div className={cn("label-mono relative col-start-1 row-start-1 mb-2 h-[1lh]", toneText[mark.tone ?? "liq"])}>
          <span
            className="absolute top-0 truncate"
            // Runs away from the nearer edge (right of the line in the left half) and never past the ruler.
            style={
              markPct <= 50
                ? { left: `calc(${markPct}% + 0.625rem)`, maxWidth: `calc(${100 - markPct}% - 0.625rem)` }
                : { right: `calc(${100 - markPct}% + 0.625rem)`, maxWidth: `calc(${markPct}% - 0.625rem)` }
            }
          >
            {mark.label}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${span} ${H}`}
        preserveAspectRatio="none"
        overflow="visible"
        className={cn("col-start-1 row-start-2 block w-full", rulerHeight[size])}
        fill="none"
      >
        <path d={minorPath} className="stroke-line-3" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
        <path d={majorPath} className="stroke-fg-4" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" />
      </svg>

      {mark && (
        <div className={cn("pointer-events-none relative col-start-1 row-start-2", mark.label && "row-start-1 row-end-3")}>
          <span
            data-slot="tick-ruler-highlight"
            className={cn("absolute inset-y-0 w-0 border-l border-dashed", lineColor[mark.tone ?? "liq"])}
            style={{ left: `${markPct}%` }}
          />
        </div>
      )}

      {shown.length > 0 && (
        <div className="label-mono relative col-start-1 row-start-3 mt-2 h-[1lh] text-fg-3">
          {shown.map(({ index, content }, j) => {
            const p = pct(index);
            return (
              <span
                key={index}
                className={cn("absolute top-0 whitespace-nowrap", thinning(j))}
                // Anchor slides with the position (0% → left-aligned, 100% → right-aligned): edge labels never overflow.
                style={{ left: `${p}%`, transform: `translateX(-${p}%)` }}
              >
                {content}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
