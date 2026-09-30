import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "./tone";

export const chipStyles = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control border",
    "border-line-2 bg-transparent text-fg-2",
    "transition-[background-color,border-color,color,scale] duration-(--dur-fast) ease-out-quart",
    "hover:border-line-3 hover:bg-elev-2 hover:text-fg-1",
    "active:scale-[0.96] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:shrink-0",
  ],
  {
    variants: {
      size: {
        sm: "h-7 gap-1.5 px-2.5 text-caption [&_svg]:size-3.5",
        md: "h-9 gap-2 px-3 text-body-sm [&_svg]:size-4",
      },
      /** Tabular mono label, for values like `0.5%`. */
      mono: { true: "font-mono", false: "" },
    },
    defaultVariants: { size: "sm", mono: false },
  },
);

/** Pressed look per tone: tinted fill and a brighter border (luminance changes too, not only hue). */
const pressedTone: Record<Tone, string> = {
  neutral: "aria-pressed:border-fg-3 aria-pressed:bg-elev-3 aria-pressed:text-fg-1",
  calm: "aria-pressed:border-calm/60 aria-pressed:bg-calm/14 aria-pressed:text-calm-hi",
  warn: "aria-pressed:border-warn/60 aria-pressed:bg-warn/12 aria-pressed:text-warn-hi",
  liq: "aria-pressed:border-liq/65 aria-pressed:bg-liq/14 aria-pressed:text-liq-hi",
  safe: "aria-pressed:border-safe/60 aria-pressed:bg-safe/12 aria-pressed:text-safe-hi",
  monad: "aria-pressed:border-monad/65 aria-pressed:bg-monad/16 aria-pressed:text-monad-hi",
};

type ChipProps = ComponentProps<"button"> &
  VariantProps<typeof chipStyles> & {
    /** Toggle state (`aria-pressed`). Leave undefined for a plain action chip. */
    pressed?: boolean;
    /** Color of the pressed state. Pair a status tone with an icon or a word that says why. */
    tone?: Tone;
    icon?: LucideIcon;
  };

/** Compact toggle: shock presets, sample borrowers, filters. */
export function Chip({ pressed, tone = "neutral", icon: Icon, size, mono, className, children, ...props }: ChipProps) {
  return (
    <button type="button" aria-pressed={pressed} className={cn(chipStyles({ size, mono }), pressedTone[tone], className)} {...props}>
      {Icon && <Icon aria-hidden />}
      {children}
    </button>
  );
}

type ChipGroupProps = ComponentProps<"div"> & ({ "aria-label": string } | { "aria-labelledby": string });

/** Labelled row of chips (`role="group"`) that wraps on small screens. */
export function ChipGroup({ className, ...props }: ChipGroupProps) {
  return <div role="group" className={cn("flex flex-wrap gap-1.5", className)} {...props} />;
}
