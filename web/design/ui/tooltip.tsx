"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createContext, use, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./overlay.module.css";

/** The tooltip bubble, exported for static previews (e.g. on /design). */
export const tooltipSurface = "rounded-control border border-line-3 bg-elev-3 px-2.5 py-1.5 text-body-sm text-fg-1 shadow-pop";

/** True below a <TooltipProvider>, so a lone <Tooltip> can bring its own provider. */
const ProviderMounted = createContext(false);

/**
 * Shared hover delay for every tooltip below it (300ms; moving between tooltips within 300ms opens the
 * next one at once). Mount it once near the root of the app.
 */
export function TooltipProvider({ delayDuration = 300, skipDelayDuration = 300, children, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props}>
      <ProviderMounted value>{children}</ProviderMounted>
    </TooltipPrimitive.Provider>
  );
}

type TooltipProps = Pick<ComponentProps<typeof TooltipPrimitive.Root>, "open" | "defaultOpen" | "onOpenChange" | "delayDuration"> & {
  content: ReactNode;
  /** One element that takes a ref and pointer/focus handlers, e.g. an icon-only <Button aria-label>. */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
};

/**
 * Short label on hover or keyboard focus, e.g. for icon-only buttons (which still need their own
 * `aria-label`). Not for anything essential: touch screens never show it.
 */
export function Tooltip({ content, children, side = "top", align = "center", className, ...rootProps }: TooltipProps) {
  const hasProvider = use(ProviderMounted);
  const tooltip = (
    <TooltipPrimitive.Root {...rootProps}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            styles.float,
            tooltipSurface,
            "z-(--z-popover) max-w-64 select-none",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  return hasProvider ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>;
}
