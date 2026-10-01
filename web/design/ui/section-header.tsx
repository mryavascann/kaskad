import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./label";

const titleSize = {
  /** Landing sections. */
  display: "text-display",
  /** App pages and dense sections. */
  title: "text-title-1",
} as const;

type SectionHeaderProps = Omit<ComponentProps<"header">, "title"> & {
  /** Section number, e.g. "02". */
  index?: string;
  /** Eyebrow text, e.g. "The finding". */
  kicker?: ReactNode;
  /** Headline. One `<em>` becomes the Instrument Serif accent: `<>The pool can clear <em>so little</em></>`. */
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links; right-aligned on wide screens (start) or below (center). */
  actions?: ReactNode;
  align?: "start" | "center";
  /** Heading level. */
  as?: "h1" | "h2" | "h3";
  size?: keyof typeof titleSize;
  /** id of the heading, for `aria-labelledby` on the enclosing section. */
  titleId?: string;
};

/** Eyebrow, headline, lead and actions for a landing or app section. */
export function SectionHeader({
  index,
  kicker,
  title,
  description,
  actions,
  align = "start",
  as: Heading = "h2",
  size = "display",
  titleId,
  className,
  ...props
}: SectionHeaderProps) {
  const center = align === "center";
  return (
    <header
      data-slot="section-header"
      className={cn(
        "flex min-w-0 flex-col gap-8",
        center ? "items-center text-center" : "lg:flex-row lg:items-end lg:justify-between lg:gap-12",
        className,
      )}
      {...props}
    >
      <div className={cn("flex min-w-0 flex-col gap-5", center ? "max-w-3xl items-center" : "max-w-4xl")}>
        {(kicker || index) && (
          <Eyebrow index={index} className={cn(center && "justify-center")}>
            {kicker}
          </Eyebrow>
        )}
        <Heading
          id={titleId}
          className={cn(
            titleSize[size],
            "text-fg-1 [&_em]:font-serif [&_em]:font-normal [&_em]:tracking-[-0.02em] [&_em]:text-fg-2 [&_em]:italic",
          )}
        >
          {title}
        </Heading>
        {description && <p className={cn("max-w-2xl text-lead text-fg-2", center && "mx-auto")}>{description}</p>}
      </div>
      {actions && <div className={cn("flex shrink-0 flex-wrap items-center gap-3", center && "justify-center")}>{actions}</div>}
    </header>
  );
}
