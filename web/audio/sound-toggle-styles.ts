import { cn } from "@/lib/utils";

/** The sound toggle's look: an icon button (nav bar) or a full-width row with its label (mobile menu). */
const base = [
  "inline-flex items-center rounded-control border border-line-2",
  "transition-colors duration-(--dur-fast) ease-out-quart hover:border-line-3 hover:text-fg-1",
  "aria-pressed:border-line-3 aria-pressed:text-fg-1",
].join(" ");

export const SOUND_TOGGLE_ICON = `${base} h-8 min-w-8 justify-center gap-2 px-2 text-fg-3`;
export const SOUND_TOGGLE_ROW = `${base} h-12 min-w-8 w-full justify-start gap-3 px-3 text-fg-2 [&_svg]:size-4`;

/**
 * Classes for `SoundToggle`, merged with `cn`. Server-safe (no "use client"), so the nav merges them
 * on the server and the toggle itself ships without tailwind-merge.
 */
export function soundToggleClass({ showLabel = false, className }: { showLabel?: boolean; className?: string } = {}): string {
  return cn(showLabel ? SOUND_TOGGLE_ROW : SOUND_TOGGLE_ICON, className);
}
