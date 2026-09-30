"use client";

import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { buttonStyles, type ButtonVariants } from "./button-styles";

export { buttonStyles };

type ButtonProps = ComponentProps<"button"> &
  ButtonVariants & {
    /**
     * Render the child element with button styles instead of a <button>. Client components only: for
     * links (and anything rendered by a Server Component) use `ButtonLink`, which needs no Slot.
     */
    asChild?: boolean;
    /** Shows a spinner, sets aria-busy and blocks clicks while keeping the label (and width). */
    loading?: boolean;
  };

export function Button({ className, variant, size, asChild = false, loading = false, onClick, children, ...props }: ButtonProps) {
  const classes = cn(buttonStyles({ variant, size }), className);
  if (asChild) return <Slot className={classes} onClick={onClick} {...props}>{children}</Slot>;
  return (
    <button
      type="button"
      className={classes}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      // Keep focus while busy (a disabled button would drop it) but ignore repeated activation.
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...props}
    >
      {loading && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Trailing arrow that nudges on hover; put it last inside a Button. */
export function ButtonArrow({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block transition-[translate] duration-(--dur-fast) ease-out-quart group-hover/button:translate-x-(--nudge)",
        className,
      )}
      {...props}
    >
      →
    </span>
  );
}
