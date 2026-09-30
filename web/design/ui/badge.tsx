import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { toneIcon, toneSoft, toneText, type Tone } from "./tone";

export type BadgeVariant = "soft" | "outline" | "solid";
export type BadgeSize = "sm" | "md";

const outline: Record<Tone, string> = {
  neutral: "border-line-3 text-fg-2",
  calm: "border-calm/45 text-calm-hi",
  warn: "border-warn/50 text-warn",
  liq: "border-liq/60 text-liq-hi",
  safe: "border-safe/50 text-safe",
  monad: "border-monad/60 text-monad-hi",
};

/** Strong alarm: the status fills the tag and the text drops to the page color (AA on every fill). */
const solid: Record<Tone, string> = {
  neutral: "border-fg-1 bg-fg-1 text-bg",
  calm: "border-calm bg-calm text-bg",
  warn: "border-warn bg-warn text-bg",
  liq: "border-liq bg-liq text-bg",
  safe: "border-safe bg-safe text-bg",
  monad: "border-monad bg-monad text-bg",
};

const size: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 px-1.5 [&>svg]:size-3",
  md: "h-6 gap-1.5 px-2 [&>svg]:size-3.5",
};

export function badgeStyles({
  tone = "neutral",
  variant = "soft",
  size: s = "md",
  mono = false,
  className,
}: { tone?: Tone; variant?: BadgeVariant; size?: BadgeSize; mono?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-tag border align-middle [&>svg]:shrink-0",
    mono ? "label-mono" : "text-caption font-medium",
    size[s],
    variant === "soft" && [toneSoft[tone], toneText[tone]],
    variant === "outline" && ["bg-transparent", outline[tone]],
    variant === "solid" && solid[tone],
    className,
  );
}

type BadgeProps = ComponentProps<"span"> & {
  tone?: Tone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Uppercase mono label style (readouts, alarms like BORROWS PAUSED). */
  mono?: boolean;
  /**
   * Defaults to the tone's icon so the status never relies on color alone. Pass `null` only when the
   * text itself already states the status.
   */
  icon?: LucideIcon | null;
};

/** Short status or metadata tag. `variant="solid"` is reserved for strong alarms. */
export function Badge({ tone = "neutral", variant = "soft", size = "md", mono = false, icon, className, children, ...props }: BadgeProps) {
  const Icon = icon === undefined ? toneIcon[tone] : icon;
  return (
    <span data-tone={tone} data-variant={variant} className={badgeStyles({ tone, variant, size, mono, className })} {...props}>
      {Icon && <Icon aria-hidden />}
      {/* Mono labels track 0.16em after the last letter too; pull it back so the padding looks even. */}
      <span className={cn("min-w-0 truncate", mono && "-mr-[0.16em]")}>{children}</span>
    </span>
  );
}
