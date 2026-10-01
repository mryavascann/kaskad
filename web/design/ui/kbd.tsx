import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const size = {
  sm: "h-5 min-w-5 px-1 text-label tracking-normal",
  md: "h-6 min-w-6 px-1.5 text-caption",
} as const;

type KbdProps = ComponentProps<"kbd"> & {
  size?: keyof typeof size;
  /**
   * Spoken name for symbol keys (⌘ is read as "place of interest sign"): `<Kbd label="Command">⌘</Kbd>`.
   * The symbol stays visible; screen readers get the word.
   */
  label?: string;
};

/** One key, drawn as a keycap. */
export function Kbd({ size: s = "md", label, className, children, ...props }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-tag border border-line-3 border-b-line-strong bg-elev-2 font-mono font-normal leading-none text-fg-2",
        size[s],
        className,
      )}
      {...props}
    >
      {label ? (
        <>
          <span aria-hidden>{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </kbd>
  );
}

/** A key combination. Nested `<kbd>` is the HTML way to say "press these together". */
export function KbdGroup({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1 font-mono", className)} {...props} />;
}
