import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FootnoteProps = ComponentProps<"p"> & {
  /** Leading mono label. */
  label?: ReactNode;
  icon?: LucideIcon;
  as?: "p" | "div" | "figcaption";
};

/**
 * Always-visible small print for the model and honesty notes that qualify a number. Never hidden
 * behind a tooltip: the caveat has to be on screen whenever the number is.
 */
export function Footnote({ label = "Model", icon: Icon, as: Tag = "p", className, children, ...props }: FootnoteProps) {
  return (
    <Tag data-slot="footnote" className={cn("flex min-w-0 items-start gap-2.5 text-caption text-fg-3", className)} {...props}>
      {(Icon || label) && (
        // Exactly one caption line tall, so the label centers on the first line of the note.
        <span className="label-mono flex h-[calc(var(--text-caption)*var(--text-caption--line-height))] shrink-0 items-center gap-1.5 text-fg-2">
          {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
          {label}
          {/* A pause for screen readers between the label and the note. */}
          {label && <span className="sr-only">:</span>}
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </Tag>
  );
}
