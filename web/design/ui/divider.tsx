import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./divider.module.css";

function Rule({ ticks }: { ticks: boolean }) {
  return (
    <span aria-hidden className="relative block h-px min-w-4 flex-1 bg-line-2">
      {ticks && <span data-slot="divider-ticks" className={cn("absolute inset-x-0 top-px h-[7px]", styles.ticks)} />}
    </span>
  );
}

type DividerProps = Omit<ComponentProps<"div">, "children"> & {
  /** Mono label on the line (read as text, so it can name the part that follows). */
  label?: ReactNode;
  align?: "center" | "start";
  /** Ruler ticks under the line. */
  ticks?: boolean;
  orientation?: "horizontal" | "vertical";
};

/** 1px rule. With a label it reads like an axis title: `── SOURCE ──` or `SOURCE ─────`. */
export function Divider({ label, align = "center", ticks = false, orientation = "horizontal", className, ...props }: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        data-slot="divider"
        className={cn("w-px shrink-0 self-stretch bg-line-2", className)}
        {...props}
      />
    );
  }

  if (!label) {
    return (
      <div role="separator" data-slot="divider" className={cn("relative h-px w-full shrink-0 bg-line-2", ticks && "mb-[7px]", className)} {...props}>
        {ticks && <span aria-hidden data-slot="divider-ticks" className={cn("absolute inset-x-0 top-px h-[7px]", styles.ticks)} />}
      </div>
    );
  }

  return (
    <div data-slot="divider" className={cn("label-mono flex w-full min-w-0 items-center gap-3 text-fg-3", className)} {...props}>
      {align === "center" && <Rule ticks={ticks} />}
      <span className="min-w-0 shrink truncate">{label}</span>
      <Rule ticks={ticks} />
    </div>
  );
}
