import { RotateCw } from "lucide-react";
import { Label } from "@/design/ui/label";
import { cn } from "@/lib/utils";

/** The liquidation loop: four steps in order, then back to the start. */
export function CascadeLoop({ label, steps, again }: { label: string; steps: [string, string][]; again: string }) {
  return (
    <figure className="flex flex-col gap-4">
      <figcaption>
        <Label>{label}</Label>
      </figcaption>
      <ol className="grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="relative flex flex-col gap-2 bg-elev-1 p-5">
            <span className="flex items-center gap-2 label-mono text-fg-3">
              <span className={cn("inline-block size-1.5 rounded-full", i === steps.length - 1 ? "bg-liq" : i === 0 ? "bg-calm" : "bg-warn")} aria-hidden />
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-title-3 text-fg-1">{title}</h3>
            <p className="text-body-sm text-fg-2">{body}</p>
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-2 label-mono text-liq-hi">
        <RotateCw className="size-3.5" aria-hidden />
        {again}
      </p>
    </figure>
  );
}

/** Data path from the mainnet snapshot to the on-chain result, left to right (top to bottom on phones). */
export function Pipeline({ label, nodes }: { label: string; nodes: [string, string][] }) {
  return (
    <figure className="flex flex-col gap-4">
      <figcaption>
        <Label>{label}</Label>
      </figcaption>
      <ol className="relative grid gap-3 lg:grid-cols-6 lg:gap-0">
        {/* Connector: vertical on phones, horizontal from lg, centre of circle 1 to centre of circle 6
            (circles sit at the start of each sixth, 12 px to their centre). */}
        <span
          aria-hidden
          className="absolute top-3 bottom-3 left-[11px] w-px bg-line-3 lg:top-[11px] lg:right-[calc(100%/6-12px)] lg:bottom-auto lg:left-3 lg:h-px lg:w-auto"
        />
        {nodes.map(([title, body], i) => (
          <li key={title} className="relative flex gap-4 lg:flex-col lg:items-start lg:gap-3 lg:pr-4">
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border bg-bg font-mono text-[10px]",
                i === 3 ? "border-monad/60 text-monad-hi" : "border-line-strong text-fg-2",
              )}
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-body-sm font-medium text-fg-1">{title}</span>
              <span className="text-caption text-fg-3">{body}</span>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
