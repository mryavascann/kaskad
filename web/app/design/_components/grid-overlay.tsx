"use client";

import { Columns3 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Shows the 4 / 8 / 12 column layout grid over the page. Toggle with the button or the G key. */
export function GridOverlayToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "g" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      setOn((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setOn((value) => !value)}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-control border px-3 text-body-sm transition-colors duration-(--dur-fast)",
          on ? "border-monad/50 bg-monad/10 text-fg-1" : "border-line-3 text-fg-2 hover:text-fg-1",
        )}
      >
        <Columns3 className="size-4" aria-hidden />
        Grid
        <kbd className="label-mono rounded-tag border border-line-2 px-1 text-fg-3">G</kbd>
      </button>
      {on && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-(--z-overlay)">
          <div className="page-shell grid-page h-full">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className={cn("h-full border-x border-monad/25 bg-monad/6", i >= 4 && "hidden md:block", i >= 8 && "md:hidden lg:block")}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
