import { Inbox, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  /** One row for tables, panels and lists (e.g. "No liquidations at this shock"). */
  compact?: boolean;
  /** Heading element of the title; `p` when it should not appear in the outline. */
  titleAs?: "h2" | "h3" | "h4" | "p";
};

/**
 * "Nothing here" with a reason and, when there is one, the next step. An empty result is a result:
 * say what was checked, not just that nothing came back.
 */
export function EmptyState({ icon: Icon = Inbox, title, body, action, compact = false, titleAs: Title = "h3", className, ...props }: EmptyStateProps) {
  if (compact) {
    return (
      <div
        data-slot="empty-state"
        data-compact=""
        className={cn(
          "flex min-w-0 flex-col gap-3 rounded-control border border-dashed border-line-2 px-4 py-3 sm:flex-row sm:items-center",
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-3" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Title className="text-body-sm font-medium text-fg-1">{title}</Title>
            {body && <p className="text-caption text-fg-3">{body}</p>}
          </div>
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">{action}</div>}
      </div>
    );
  }

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "relative isolate flex min-w-0 flex-col items-center gap-5 overflow-hidden rounded-panel border border-dashed border-line-2 px-6 py-12 text-center sm:py-16",
        className,
      )}
      {...props}
    >
      {/* Instrument grid, faded out towards the edges: an empty plot, not a void. */}
      <div
        aria-hidden
        className="bg-grid absolute inset-0 -z-10 [--grid-cell:24px] [mask-image:radial-gradient(closest-side,black,transparent)]"
      />
      <span className="corner-ticks grid size-12 place-items-center rounded-control border border-line-2 bg-elev-2 text-fg-2 [--tick-inset:3px] [--tick-len:5px] [--tick:var(--color-line-3)]">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <Title className="text-title-3 text-fg-1">{title}</Title>
        {body && <p className="text-body-sm text-fg-2">{body}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
