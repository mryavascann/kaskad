"use client";

import { LoaderCircle, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Toaster as Sonner, toast, type ExternalToast, type ToasterProps } from "sonner";
import { cn } from "@/lib/utils";
import { toneIcon, type Tone } from "./tone";

export { toast };

/** Tone of a toast, as a CSS variable the icon chip reads (per type, or per toast via `notify`). */
const toneColor: Record<Tone, string> = {
  neutral: "var(--color-fg-2)",
  calm: "var(--color-calm-hi)",
  warn: "var(--color-warn)",
  liq: "var(--color-liq-hi)",
  safe: "var(--color-safe)",
  monad: "var(--color-monad-hi)",
};

function ToneIcon({ tone }: { tone: Tone }) {
  const Icon = toneIcon[tone];
  return <Icon aria-hidden />;
}

/*
 * Sonner runs unstyled: its own stylesheet is unlayered and would beat Tailwind's layered utilities.
 * It still positions, stacks and swipes the toasts; everything visual comes from tokens below. The few
 * `!` classes override the rules sonner applies even when unstyled (outline reset, dark-theme text).
 */
const classNames = {
  toast: cn(
    "flex w-(--width) items-start gap-3 rounded-panel border border-line-3 bg-elev-2 py-3.5 pr-11 pl-3.5 font-sans text-fg-1 shadow-pop",
    // Collapsed stack: only the front toast shows its content (sonner does this in styled mode only).
    "data-[expanded=false]:data-[front=false]:*:opacity-0",
    "focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-monad-hi! focus-visible:outline-solid!",
  ),
  icon: "relative grid size-6 shrink-0 place-items-center rounded-tag border border-(--tone)/40 bg-(--tone)/10 text-(--tone) [&_svg]:size-3.5",
  content: "flex min-w-0 flex-1 flex-col gap-1 pt-0.5",
  title: "text-body-sm font-medium text-fg-1",
  description: "font-mono text-caption text-fg-3!",
  actionButton: cn(
    "h-7 shrink-0 self-center rounded-control border border-line-3 px-2.5 text-body-sm font-medium text-fg-1",
    "transition-[background-color,border-color] duration-(--dur-fast) ease-out-quart hover:border-line-strong hover:bg-elev-3",
  ),
  cancelButton: cn(
    "h-7 shrink-0 self-center rounded-control px-2.5 text-body-sm text-fg-2",
    "transition-[background-color,color] duration-(--dur-fast) ease-out-quart hover:bg-elev-3 hover:text-fg-1!",
  ),
  closeButton: cn(
    "absolute top-3 right-3 grid size-6 place-items-center rounded-tag [&_svg]:size-3.5",
    "transition-[background-color,color] duration-(--dur-fast) ease-out-quart hover:text-fg-1!",
  ),
  // One class per sonner type (each toast has exactly one), so the tone never fights another class.
  default: "[--tone:var(--color-fg-2)]",
  info: "[--tone:var(--color-fg-2)]",
  loading: "[--tone:var(--color-fg-2)]",
  success: "[--tone:var(--color-safe)]",
  warning: "[--tone:var(--color-warn)]",
  error: "[--tone:var(--color-liq-hi)]",
} satisfies NonNullable<ToasterProps["toastOptions"]>["classNames"];

const icons: ToasterProps["icons"] = {
  success: <ToneIcon tone="safe" />,
  info: <ToneIcon tone="neutral" />,
  warning: <ToneIcon tone="warn" />,
  error: <ToneIcon tone="liq" />,
  loading: <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />,
  close: <X aria-hidden />,
};

/** Variables the unstyled toasts still inherit from sonner's dark theme rules (close button, stacking). */
const surface = {
  "--width": "380px",
  "--normal-bg": "transparent",
  "--normal-bg-hover": "var(--color-elev-3)",
  "--normal-border": "transparent",
  "--normal-border-hover": "transparent",
  "--normal-text": "var(--color-fg-3)",
  zIndex: "var(--z-toast)",
  fontFamily: "var(--font-sans)",
} as CSSProperties;

/**
 * App-wide toaster (mount once, in the root layout). Bottom right, dark, dismissible, tokens only.
 * Sonner's own calls keep working: `toast.success` = safe, `toast.error` = liq, `toast.warning` = warn,
 * `toast.info` = neutral. Use `notify(title, { tone })` for any of the six tones.
 */
export function Toaster({ toastOptions, style, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      icons={icons}
      style={{ ...surface, ...style }}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: { ...classNames, ...toastOptions?.classNames },
      }}
      {...props}
    />
  );
}

export type NotifyOptions = ExternalToast & { tone?: Tone };

/** Toast in one of the six tones. Returns the toast id (for `toast.dismiss(id)`). */
export function notify(title: ReactNode, { tone = "neutral", ...options }: NotifyOptions = {}) {
  switch (tone) {
    case "safe":
      return toast.success(title, options);
    case "warn":
      return toast.warning(title, options);
    case "liq":
      return toast.error(title, options);
    case "neutral":
      return toast.info(title, options);
    default:
      // No sonner type for calm / monad: default toast with the tone icon and the tone variable.
      return toast(title, {
        icon: <ToneIcon tone={tone} />,
        ...options,
        style: { "--tone": toneColor[tone], ...options.style } as CSSProperties,
      });
  }
}
