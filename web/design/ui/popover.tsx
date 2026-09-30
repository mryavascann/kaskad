"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import styles from "./overlay.module.css";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/** The popover panel, exported for static previews (e.g. on /design). */
export const popoverSurface = "rounded-panel border border-line-3 bg-elev-2 p-4 text-body-sm text-fg-2 shadow-pop";

type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Small pointer towards the trigger. */
  arrow?: boolean;
};

/** Floating panel next to its trigger. Escape and outside clicks close it; focus returns to the trigger. */
export function PopoverContent({ className, sideOffset = 8, collisionPadding = 12, arrow = false, children, ...props }: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          styles.float,
          popoverSurface,
          "z-(--z-popover) w-max max-w-[min(22rem,calc(100vw-1.5rem))] outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {arrow && (
          <PopoverPrimitive.Arrow asChild width={14} height={7}>
            {/* Open path: the stroke draws the two slanted edges; the fill hides the panel border under the base. */}
            <svg viewBox="0 0 14 7" aria-hidden className="relative -top-px block overflow-visible">
              <path d="M0 0 L7 7 L14 0" className="fill-elev-2 stroke-line-3" />
            </svg>
          </PopoverPrimitive.Arrow>
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
