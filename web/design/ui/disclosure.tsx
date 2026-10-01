import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DisclosureProps = Omit<ComponentProps<"details">, "title" | "open"> & {
  /** The always-visible line, e.g. "How was this calculated?". */
  summary: ReactNode;
  /** Mono uppercase summary (label style). */
  mono?: boolean;
  /** `plain`: inline text toggle. `panel`: bordered block (advanced settings). */
  variant?: "plain" | "panel";
  defaultOpen?: boolean;
};

/** Native `<details>` / `<summary>`: keyboard and find-in-page work out of the box, no JavaScript. */
export function Disclosure({ summary, mono = false, variant = "plain", defaultOpen, className, children, ...props }: DisclosureProps) {
  const panel = variant === "panel";
  return (
    <details
      open={defaultOpen}
      className={cn("group/disclosure min-w-0", panel && "rounded-panel border border-line-2 bg-elev-1 shadow-panel", className)}
      {...props}
    >
      <summary
        className={cn(
          "group/summary flex list-none select-none items-center gap-2 text-fg-2 [&::-webkit-details-marker]:hidden",
          "transition-colors duration-(--dur-fast) ease-out-quart hover:text-fg-1 group-open/disclosure:text-fg-1",
          mono ? "label-mono" : "text-body-sm font-medium",
          panel
            ? "min-h-12 justify-between rounded-panel px-4 focus-visible:-outline-offset-2 group-open/disclosure:rounded-b-none"
            : "-mx-1.5 min-h-8 w-fit rounded-control px-1.5",
        )}
      >
        <span>{summary}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-fg-3 transition-[rotate,translate] duration-(--dur-fast) ease-out-quart motion-reduce:transition-none",
            "group-open/disclosure:rotate-180 group-active/summary:translate-y-px",
          )}
        />
      </summary>
      <div
        className={cn(
          "text-body-sm text-fg-2 group-open/disclosure:animate-fade-in",
          panel ? "border-t border-line px-4 py-4" : "pt-2 pb-1",
        )}
      >
        {children}
      </div>
    </details>
  );
}
