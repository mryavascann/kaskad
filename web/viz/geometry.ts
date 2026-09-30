/**
 * Pure geometry shared by the charts. Every number that ends up in markup goes through `round()`
 * (design rule 9): Node and the browser can disagree in the last bits of Math.sin/cos/exp, and a
 * difference in an SVG attribute is a hydration mismatch.
 */
import { scaleLinear } from "d3-scale";

/** Rounds to `digits` decimals (2 by default) and never returns -0. */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/** A 0–1 fraction as a CSS percentage, rounded (e.g. for `left` / `top` of an overlay). */
export const pct = (fraction: number, digits = 3) => `${round(fraction * 100, digits)}%`;

/**
 * Horizontal position (0–1) of block `step` in a run of `steps` blocks. The axis is inset by half a
 * block on both sides, so a bar centered on the first or last block still fits inside the plot.
 */
export const blockX = (step: number, steps: number) => (step + 0.5) / (Math.max(0, steps) + 1);

/** Width of that inset on each side, as a 0–1 fraction of the plot. */
export const blockInset = (steps: number) => 0.5 / (Math.max(0, steps) + 1);

/** Point at `deg` degrees (0 = up, clockwise) on a circle, rounded. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [round(cx + r * Math.sin(a)), round(cy - r * Math.cos(a))];
}

/** SVG arc from `from` to `to` degrees (0 = up, clockwise), rounded. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to >= from ? 1 : 0;
  return `M${x1} ${y1}A${round(r)} ${round(r)} 0 ${large} ${sweep} ${x2} ${y2}`;
}

/** A "nice" upper bound for a linear scale from 0 (d3 nice()); 1 when there is nothing to show. */
export function niceMax(max: number, count = 4): number {
  if (!(max > 0) || !Number.isFinite(max)) return 1;
  return scaleLinear().domain([0, max]).nice(count).domain()[1];
}

/** Nice ticks from 0 to `max` (inclusive). */
export function linearTicks(max: number, count = 4): number[] {
  return scaleLinear().domain([0, max]).ticks(count);
}

/**
 * Container widths (rem) below which an axis label may drop out, as literal classes so Tailwind
 * emits them. The axis element must be a `@container`.
 */
const HIDE_BELOW = [
  [8, "@max-[8rem]:hidden"],
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

/**
 * Below these container widths (rem) a marker label that normally hangs beside its line is centred on
 * the line instead (anchor slides with the position, like the axis labels), so it never leaves the
 * plot. Literal classes, so Tailwind emits them; the element needs `--x` (the line's left, in %).
 */
const SLIDE_BELOW = [
  [16, "@max-[16rem]:left-(--x) @max-[16rem]:right-auto @max-[16rem]:-translate-x-(--x)"],
  [20, "@max-[20rem]:left-(--x) @max-[20rem]:right-auto @max-[20rem]:-translate-x-(--x)"],
  [24, "@max-[24rem]:left-(--x) @max-[24rem]:right-auto @max-[24rem]:-translate-x-(--x)"],
  [28, "@max-[28rem]:left-(--x) @max-[28rem]:right-auto @max-[28rem]:-translate-x-(--x)"],
  [32, "@max-[32rem]:left-(--x) @max-[32rem]:right-auto @max-[32rem]:-translate-x-(--x)"],
  [36, "@max-[36rem]:left-(--x) @max-[36rem]:right-auto @max-[36rem]:-translate-x-(--x)"],
  [40, "@max-[40rem]:left-(--x) @max-[40rem]:right-auto @max-[40rem]:-translate-x-(--x)"],
  [48, "@max-[48rem]:left-(--x) @max-[48rem]:right-auto @max-[48rem]:-translate-x-(--x)"],
  [56, "@max-[56rem]:left-(--x) @max-[56rem]:right-auto @max-[56rem]:-translate-x-(--x)"],
  [64, "@max-[64rem]:left-(--x) @max-[64rem]:right-auto @max-[64rem]:-translate-x-(--x)"],
  [80, "@max-[80rem]:left-(--x) @max-[80rem]:right-auto @max-[80rem]:-translate-x-(--x)"],
] as const;

/**
 * Where a marker label goes: beside its line (right of it in the left half, left of it in the right
 * half) when the container is wide enough for the text, centred on the line below that width.
 * Pure: the same classes on the server and in the browser; no measuring.
 */
export function markerLabel(x: number, chars: number): { side: "right" | "left"; className: string } {
  const side = x <= 0.5 ? "right" : "left";
  const room = side === "right" ? 1 - x : x;
  const need = (chars * LABEL_CHAR_REM + 1) / Math.max(0.01, room);
  const slide = SLIDE_BELOW.find(([rem]) => rem >= need)?.[1] ?? SLIDE_BELOW[SLIDE_BELOW.length - 1][1];
  const beside = side === "right" ? "left-[calc(var(--x)+0.375rem)]" : "right-[calc(100%-var(--x)+0.375rem)]";
  return { side, className: `${beside} ${slide}` };
}

/** The literal class that hides an element in containers narrower than `rem` (rounded up); undefined when it always fits. */
export function hideBelow(rem: number): string | undefined {
  if (rem <= HIDE_BELOW[0][0]) return undefined;
  return HIDE_BELOW.find(([w]) => w >= rem)?.[1] ?? "hidden";
}

/** `label-mono` advance per character (0.6em + 0.16em tracking at 11px) and the gap between labels, in rem. */
export const LABEL_CHAR_REM = 0.53;
const LABEL_GAP_REM = 0.75;

export type AxisLabel = { /** 0–1 position on the axis. */ pos: number; /** Characters of the label. */ chars: number };

/**
 * Which labels of an axis to hide on narrow containers, without measuring (the same markup on the
 * server and in the browser). A label is anchored like `TickRuler` does it (0 % → left aligned,
 * 100 % → right aligned). First and last always stay; the others, in order of `priority` (default:
 * every other label first), get the smallest container width at which they clear every label with
 * a higher priority. Returns one class (or undefined) per label.
 */
export function thinLabels(labels: readonly AxisLabel[], priority?: readonly number[]): (string | undefined)[] {
  const n = labels.length;
  if (n <= 2) return labels.map(() => undefined);
  const order =
    priority ?? [0, n - 1, ...labels.map((_, i) => i).filter((i) => i > 0 && i < n - 1 && i % 2 === 0), ...labels.map((_, i) => i).filter((i) => i > 0 && i < n - 1 && i % 2 === 1)];
  // Label i starts at pos·(W − w) (anchor slides with the position), so the space between a label a
  // and a label b to its right grows linearly with the width W: solve for the gap.
  const clearAt = (i: number, k: number) => {
    const [a, b] = labels[i].pos <= labels[k].pos ? [labels[i], labels[k]] : [labels[k], labels[i]];
    if (b.pos - a.pos <= 0) return Infinity;
    const wa = a.chars * LABEL_CHAR_REM;
    const wb = b.chars * LABEL_CHAR_REM;
    return (LABEL_GAP_REM + b.pos * wb + (1 - a.pos) * wa) / (b.pos - a.pos);
  };
  const out: (string | undefined)[] = labels.map(() => undefined);
  const placed: number[] = [];
  for (const i of order) {
    if (i === 0 || i === n - 1) {
      placed.push(i);
      continue;
    }
    const need = Math.max(0, ...placed.map((k) => clearAt(i, k)));
    const hit = HIDE_BELOW.find(([rem]) => rem >= need);
    out[i] = need <= HIDE_BELOW[0][0] ? undefined : hit ? hit[1] : "hidden";
    placed.push(i);
  }
  return out;
}
