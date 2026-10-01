import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneText, type Tone } from "./tone";

type LabelProps = HTMLAttributes<HTMLElement> & {
  as?: "span" | "p" | "div" | "dt" | "h2" | "h3" | "figcaption";
  tone?: Tone;
};

/** Mono uppercase label: readout keys, axis titles, coordinates. Defaults to fg-3. */
export function Label({ as: Tag = "span", tone, className, ...props }: LabelProps) {
  return <Tag className={cn("label-mono", tone ? toneText[tone] : "text-fg-3", className)} {...props} />;
}

type EyebrowProps = ComponentProps<"p"> & {
  /** Section index, e.g. "01". Rendered in fg-2, before a hairline. */
  index?: string;
  /** Leading mark, e.g. a <StatusDot />. */
  leading?: ReactNode;
};

/** Section eyebrow: `01 ── LIQUIDATION CASCADE ENGINE`. */
export function Eyebrow({ index, leading, className, children, ...props }: EyebrowProps) {
  return (
    <p className={cn("label-mono flex items-center gap-3 text-fg-3", className)} {...props}>
      {leading}
      {index && (
        <>
          <span className="text-fg-2">{index}</span>
          <span aria-hidden className="h-px w-6 bg-line-3" />
        </>
      )}
      <span>{children}</span>
    </p>
  );
}
