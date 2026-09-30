import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow, Label } from "@/design/ui/label";

/** One documented area of the design system, with an anchor for the table of contents. */
export function DocSection({
  id,
  index,
  kicker,
  title,
  description,
  children,
  className,
}: {
  id: string;
  index: string;
  kicker: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24 border-t border-line pt-12 pb-20", className)}>
      <Eyebrow index={index}>{kicker}</Eyebrow>
      <h2 id={`${id}-title`} className="mt-5 text-title-1 text-fg-1">{title}</h2>
      {description && <p className="mt-4 max-w-2xl text-lead text-fg-2">{description}</p>}
      <div className="mt-10 flex flex-col gap-10">{children}</div>
    </section>
  );
}

/** A sub-block inside a DocSection. */
export function DocBlock({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-title-3 text-fg-1">{title}</h3>
        {note && <p className="text-caption text-fg-3">{note}</p>}
      </div>
      {children}
    </div>
  );
}

/** Frame around a live example. `label` names the variant or state, `meta` holds the API hint. */
export function Specimen({
  label,
  meta,
  children,
  className,
  bodyClassName,
  ...props
}: Omit<ComponentProps<"figure">, "children"> & { label: string; meta?: ReactNode; children: ReactNode; bodyClassName?: string }) {
  return (
    <figure className={cn("flex min-w-0 flex-col overflow-hidden rounded-panel border border-line-2 bg-elev-1", className)} {...props}>
      <div className={cn("flex min-h-28 flex-1 flex-wrap items-center gap-4 p-5", bodyClassName)}>{children}</div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-4 py-2.5">
        <Label>{label}</Label>
        {meta && <code className="text-caption text-fg-3">{meta}</code>}
      </figcaption>
    </figure>
  );
}

/** Responsive grid of specimens: 1 column on phones, 2 on tablets, `cols` on desktop. */
export function SpecGrid({ cols = 3, className, ...props }: ComponentProps<"div"> & { cols?: 2 | 3 | 4 }) {
  const desktop = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[cols];
  return <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", desktop, className)} {...props} />;
}
