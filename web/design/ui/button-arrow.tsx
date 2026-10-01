import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Trailing arrow that nudges on hover; put it last inside a Button or ButtonLink. Server-safe (no
 * "use client"): a Server Component that renders it ships no JavaScript for it.
 */
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
