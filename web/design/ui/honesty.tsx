import { BookOpen, CircleDashed, Database, FlaskConical, Ruler, Sigma, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type HonestyKind = "measured" | "assumption" | "synthetic" | "real" | "estimate" | "model";

/**
 * Where a number comes from. Hard sources (read or measured) get a solid outline; soft ones
 * (assumed, estimated, synthetic) a dashed one, so the difference survives a glance.
 */
export const HONESTY: Record<HonestyKind, { icon: LucideIcon; label: string; soft: boolean; meaning: string }> = {
  measured: { icon: Ruler, label: "Measured", soft: false, meaning: "Read from chain or measured at the source" },
  real: { icon: Database, label: "Real book", soft: false, meaning: "Real positions, e.g. Monad Aave borrowers" },
  model: { icon: BookOpen, label: "Model", soft: false, meaning: "Result of the stated model and its limits" },
  assumption: { icon: CircleDashed, label: "Assumption", soft: true, meaning: "Not measured; a stated assumption" },
  estimate: { icon: Sigma, label: "Estimate", soft: true, meaning: "Derived or approximate value" },
  synthetic: { icon: FlaskConical, label: "Synthetic book", soft: true, meaning: "Generated positions for the scale test" },
};

export const HONESTY_KINDS = Object.keys(HONESTY) as HonestyKind[];

type HonestyTagProps = ComponentProps<"span"> & {
  kind: HonestyKind;
};

/** Metadata tag that sits next to a number and says how much to trust it. Children override the default label. */
export function HonestyTag({ kind, className, children, ...props }: HonestyTagProps) {
  const { icon: Icon, label, soft } = HONESTY[kind];
  return (
    <span
      data-kind={kind}
      className={cn(
        "label-mono inline-flex min-h-5 max-w-full items-start gap-1 rounded-tag border px-1.5 text-left align-middle text-fg-3",
        soft ? "border-dashed border-line-3" : "border-line-2",
        className,
      )}
      {...props}
    >
      {/* 18px line: one line is exactly h-5 with the border; a long label wraps and the tag grows. */}
      <Icon aria-hidden className="mt-0.75 size-3 shrink-0" />
      <span className="-mr-[0.16em] min-w-0 leading-4.5 break-words">{children ?? label}</span>
    </span>
  );
}
