import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneIcon, toneSoft, toneText, type Tone } from "./tone";

/** Thin status strip on the leading edge; the icon and the title still carry the meaning. */
const strip: Record<Tone, string> = {
  neutral: "before:bg-fg-3/60",
  calm: "before:bg-calm",
  warn: "before:bg-warn",
  liq: "before:bg-liq",
  safe: "before:bg-safe",
  monad: "before:bg-monad",
};

type CalloutProps = Omit<ComponentProps<"div">, "title"> & {
  tone?: Tone;
  title?: ReactNode;
  /** Buttons or links, e.g. Retry. Sits right on wide screens, below on phones. */
  action?: ReactNode;
  /** Defaults to the tone icon. */
  icon?: LucideIcon;
  /**
   * How assistive tech hears it when it appears: `assertive` (role=alert) is the default for `liq`
   * (RPC down, revert, funding failed), `polite` (role=status) for the rest, `off` for static notes.
   */
  live?: "assertive" | "polite" | "off";
};

/** Inline message about the state of the page: an error, a caveat, a confirmation. */
export function Callout({ tone = "neutral", title, action, icon, live, className, children, ...props }: CalloutProps) {
  const Icon = icon ?? toneIcon[tone];
  const mode = live ?? (tone === "liq" ? "assertive" : "polite");
  return (
    <div
      role={mode === "assertive" ? "alert" : mode === "polite" ? "status" : undefined}
      data-tone={tone}
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-panel border py-3.5 pr-4 pl-4.5 sm:flex-row sm:items-start",
        "before:absolute before:inset-y-0 before:left-0 before:w-0.5",
        toneSoft[tone],
        strip[tone],
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", toneText[tone])} />
        <div className="flex min-w-0 flex-col gap-1">
          {title && <p className="text-body-sm font-medium text-fg-1">{title}</p>}
          {children && <div className="text-body-sm text-fg-2 [&_a]:underline [&_a]:decoration-line-3 [&_a]:underline-offset-4 [&_a:hover]:decoration-current">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">{action}</div>}
    </div>
  );
}
