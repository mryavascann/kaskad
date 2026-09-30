"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneBg, toneText, type Tone } from "./tone";

export type SliderMark = { value: number; label: string };

type SliderProps = {
  value: number;
  /** Fires on every step of a drag or key press: keep it cheap (e.g. a debounced preview). */
  onValueChange: (value: number) => void;
  /** Fires when a drag ends, a key press lands or a mark is chosen: the place for expensive work. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Fill color of the track and the ticks behind the needle. */
  tone?: Tone;
  /** Tone per value, e.g. calm → warn → liq as a shock grows. Wins over `tone`. */
  toneForValue?: (value: number) => Tone;
  /** Number of tick intervals drawn under the track (0: no ticks). */
  ticks?: number;
  /** Every Nth tick is a major (taller) tick. */
  majorEvery?: number;
  /** Labelled stops under the ruler; clicking one jumps there. When two labels would touch, the lower one is skipped. */
  marks?: readonly SliderMark[];
  /** Accessible name of the group of mark buttons. */
  marksLabel?: string;
  /** Formats the value for `aria-valuetext` and the readout, e.g. `v => "−" + v.toFixed(1) + "%"`. */
  formatValue?: (value: number) => string;
  /** Shows the formatted value at the top right, in the current tone. */
  showValue?: boolean;
  /** Visible label at the top left. Becomes the accessible name. */
  label?: ReactNode;
  disabled?: boolean;
  name?: string;
  /** Id of the focusable thumb (role="slider"). */
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

/** Mark label width in px: `label-mono` (11px Geist Mono, 0.6em advance + 0.16em tracking) plus 4px padding a side. */
const markWidth = (label: string) => label.length * 8.4 + 8;
/** Track width assumed until the first measurement (server render, tests). */
const FALLBACK_WIDTH = 320;
const EPSILON = 1e-9;

/**
 * Picks the mark labels that fit side by side. Walks from the right: presets crowd at the low end of a
 * range (0.1 / 0.5 / 1 %), so the smaller value gives way when two labels would touch.
 */
function fittingMarks(marks: readonly SliderMark[], percentOf: (v: number) => number, width: number) {
  const shown: SliderMark[] = [];
  let leftEdge = Infinity;
  for (const mark of [...marks].sort((a, b) => b.value - a.value)) {
    const w = markWidth(mark.label);
    const center = Math.min(Math.max((percentOf(mark.value) / 100) * width, w / 2), width - w / 2);
    if (center + w / 2 + 2 <= leftEdge) {
      shown.push(mark);
      leftEdge = center - w / 2;
    }
  }
  return shown.reverse();
}

/** `left` for a 1px mark so that 0% and 100% land on the first and last pixel of the track. */
const hairlineLeft = (percent: number) => `calc(${percent}% - ${percent / 100}px)`;

/**
 * Instrument slider: a 2px track, a needle thumb, tick marks and optional labelled marks.
 * Keyboard (Radix): arrows step, Shift+arrows and PageUp/PageDown step ×10, Home/End jump to the ends.
 */
export function Slider({
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  tone = "calm",
  toneForValue,
  ticks = 0,
  majorEvery = 0,
  marks,
  marksLabel = "Presets",
  formatValue = String,
  showValue = false,
  label,
  disabled = false,
  name,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: SliderProps) {
  const labelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const hasMarks = Boolean(marks?.length);

  // Mark labels need the real track width to decide which ones fit.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || !hasMarks) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMarks]);

  const span = max - min || 1;
  const percentOf = (v: number) => ((Math.min(Math.max(v, min), max) - min) / span) * 100;
  const activeTone = toneForValue?.(value) ?? tone;
  const valueText = formatValue(value);
  const labelledBy = ariaLabelledBy ?? (label ? labelId : undefined);

  const jump = (next: number) => {
    onValueChange(next);
    onValueCommit?.(next);
    thumbRef.current?.focus();
  };

  return (
    <div className={cn("flex min-w-0 flex-col", disabled && "opacity-45", className)}>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between gap-4">
          {label ? (
            // Like a native <label>: a click focuses the control (keyboard users reach the thumb with Tab).
            <span id={labelId} className="label-mono text-fg-3" onClick={() => thumbRef.current?.focus()}>
              {label}
            </span>
          ) : (
            <span />
          )}
          {showValue && (
            // The thumb already announces the value (aria-valuetext); the readout is for eyes only.
            <span
              aria-hidden
              className={cn(
                "font-mono text-metric-sm transition-colors duration-(--dur-base) ease-out-quart",
                toneText[activeTone],
              )}
            >
              {valueText}
            </span>
          )}
        </div>
      )}

      <SliderPrimitive.Root
        ref={rootRef}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        name={name}
        onValueChange={([next]) => onValueChange(next)}
        onValueCommit={onValueCommit && (([next]) => onValueCommit(next))}
        className="group/track relative flex h-11 w-full touch-none select-none items-center data-disabled:cursor-not-allowed"
      >
        <SliderPrimitive.Track className="relative h-0.5 grow overflow-hidden bg-line-3 transition-colors duration-(--dur-fast) ease-out-quart group-hover/track:bg-line-strong">
          <SliderPrimitive.Range
            className={cn("absolute h-full transition-colors duration-(--dur-base) ease-out-quart", toneBg[activeTone])}
          />
        </SliderPrimitive.Track>

        {ticks > 0 && (
          // Ruler under the track; ticks behind the needle light up in the current tone.
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(50%+5px)] h-2">
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const percent = (i / ticks) * 100;
              const major = majorEvery > 0 && i % majorEvery === 0;
              const lit = min + (i * span) / ticks <= value + EPSILON;
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute top-0 w-px transition-colors duration-(--dur-base) ease-out-quart",
                    major ? "h-2" : "h-1",
                    lit ? toneBg[activeTone] : major ? "bg-line-strong" : "bg-line-3",
                    lit && !major && "opacity-60",
                  )}
                  style={{ left: hairlineLeft(percent) }}
                />
              );
            })}
          </span>
        )}

        <SliderPrimitive.Thumb
          ref={thumbRef}
          id={id}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={ariaDescribedBy}
          aria-valuetext={valueText}
          className={cn(
            // The needle. 2px wide on purpose: Radix keeps the thumb inside the track by half its width,
            // so a narrow thumb stays aligned with the ticks at both ends. It reaches down into the ruler.
            "relative block h-[26px] w-0.5 translate-y-0.5 cursor-grab rounded-[1px] bg-fg-1 active:cursor-grabbing",
            // Invisible 44px hit area.
            "before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2",
            // Cap: a small pointer on top of the needle; grows on hover, more while dragging.
            "after:absolute after:bottom-full after:left-1/2 after:h-[5px] after:w-2.5 after:-translate-x-1/2 after:origin-bottom after:bg-fg-1 after:[clip-path:polygon(0_0,100%_0,50%_100%)]",
            "after:transition-[scale] after:duration-(--dur-fast) after:ease-out-quart group-hover/track:after:scale-110 group-active/track:after:scale-125 motion-reduce:after:transition-none",
            "focus-visible:outline-offset-[6px] data-disabled:cursor-not-allowed",
          )}
        />
      </SliderPrimitive.Root>

      {hasMarks && (
        <div role="group" aria-label={marksLabel} className="relative -mt-2 h-6">
          {fittingMarks(marks ?? [], percentOf, width ?? FALLBACK_WIDTH).map((mark) => {
            const half = markWidth(mark.label) / 2;
            const active = Math.abs(mark.value - value) < EPSILON;
            return (
              // Pointer shortcut: keyboard users step with arrows / PageUp / PageDown on the thumb.
              <button
                key={mark.value}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => jump(mark.value)}
                className={cn(
                  "label-mono absolute top-0 h-6 -translate-x-1/2 whitespace-nowrap rounded-tag px-1",
                  "transition-[color,scale] duration-(--dur-fast) ease-out-quart active:scale-95 motion-reduce:active:scale-100",
                  active ? "text-fg-1" : "text-fg-3 hover:text-fg-1",
                )}
                style={{ left: `clamp(${half}px, ${percentOf(mark.value)}%, calc(100% - ${half}px))` }}
              >
                {mark.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
