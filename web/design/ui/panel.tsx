import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";
import { toneSoft, type Tone } from "./tone";

export const panelStyles = cva("relative min-w-0 rounded-panel border", {
  variants: {
    variant: {
      /** Default surface for grouped content. */
      solid: "border-line-2 bg-elev-1 shadow-panel",
      /** Floating readouts over a scene (hero, charts). */
      glass: "border-line-3 bg-elev-1/80 shadow-pop backdrop-blur-md",
      /** Nested wells inside a panel. */
      inset: "border-line bg-bg",
    },
    interactive: {
      true: "transition-[border-color,background-color] duration-(--dur-fast) ease-out-quart hover:border-line-3",
      false: "",
    },
    corners: { true: "corner-ticks", false: "" },
  },
  defaultVariants: { variant: "solid", interactive: false, corners: false },
});

type PanelProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof panelStyles> & {
    as?: "div" | "section" | "article" | "aside" | "figure";
    /** Tints border and surface with a status tone (pair it with text or an icon that says why). */
    tone?: Tone;
  };

export function Panel({ as: Tag = "div", variant, interactive, corners, tone, className, ...props }: PanelProps) {
  return <Tag className={cn(panelStyles({ variant, interactive, corners }), tone && toneSoft[tone], className)} {...props} />;
}

type PanelHeaderProps = Omit<ComponentProps<"div">, "title"> & {
  title: ReactNode;
  /** Right side: badges, links, small controls. */
  actions?: ReactNode;
};

/** Mono label on the left, actions on the right, hairline below. */
export function PanelHeader({ title, actions, className, ...props }: PanelHeaderProps) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-3", className)} {...props}>
      <Label as="h3">{title}</Label>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}
