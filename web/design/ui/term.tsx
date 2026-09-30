"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { duration } from "@/motion/tokens";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

type TermProps = {
  /** The word as it reads in the sentence. */
  children: ReactNode;
  /** Heading of the explanation. Defaults to the word itself. */
  title?: ReactNode;
  /** The explanation: one or two plain sentences. */
  description: ReactNode;
  side?: "top" | "bottom";
  className?: string;
};

/**
 * Inline jargon explainer ("health factor", "eth_call"). A dotted-underlined button that opens a small
 * popover on click, tap, Enter or Space, and on hover for a mouse (after a short intent delay; it closes
 * when the pointer leaves unless it was opened by a click). Escape closes it and returns focus.
 */
export function Term({ children, title, description, side = "top", className }: TermProps) {
  const [open, setOpen] = useState(false);
  /** Opened by click / keyboard: stays open when the pointer leaves. */
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => () => clearTimeout(timer.current), []);

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };

  // Hover intent, mouse only (a tap also fires pointerenter, with pointerType "touch").
  const pointerIn = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || pinned.current) return;
    if (open) clearTimeout(timer.current);
    else schedule(true, duration.base);
  };
  const pointerOut = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || pinned.current) return;
    schedule(false, duration.fast);
  };

  const close = () => {
    clearTimeout(timer.current);
    pinned.current = false;
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        onPointerEnter={pointerIn}
        onPointerLeave={pointerOut}
        onClick={(event) => {
          // Our own toggle: a click on a hover-opened term pins it instead of closing it.
          event.preventDefault();
          if (open && pinned.current) return close();
          clearTimeout(timer.current);
          pinned.current = true;
          setOpen(true);
        }}
        className={cn(
          "cursor-help rounded-tag text-left underline decoration-fg-3 decoration-dotted decoration-1 underline-offset-4",
          "transition-[color,text-decoration-color] duration-(--dur-fast) ease-out-quart",
          "hover:decoration-fg-1 data-[state=open]:decoration-monad-hi",
          className,
        )}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        aria-labelledby={titleId}
        className="max-w-[min(20rem,calc(100vw-1.5rem))]"
        onPointerEnter={pointerIn}
        onPointerLeave={pointerOut}
        // Hover never steals focus; click / keyboard moves it in, so screen readers read the explanation.
        onOpenAutoFocus={(event) => {
          if (!pinned.current) event.preventDefault();
        }}
        // The panel is portaled to <body>. When it holds nothing focusable, Tab goes back to the term so the
        // page's tab order continues from there (Shift+Tab lands on the term itself).
        onKeyDown={(event) => {
          if (event.key !== "Tab" || !triggerRef.current) return;
          if (event.currentTarget.querySelector("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")) return;
          if (event.shiftKey) event.preventDefault();
          triggerRef.current.focus();
          close();
        }}
      >
        <p id={titleId} className="text-body-sm font-medium text-fg-1">
          {title ?? children}
        </p>
        <div className="mt-1.5 text-body-sm text-fg-2">{description}</div>
      </PopoverContent>
    </Popover>
  );
}
