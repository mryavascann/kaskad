import type { ReactNode } from "react";
import { Label } from "@/design/ui/label";
import { cn } from "@/lib/utils";

/**
 * `PanelHeader` (design/ui/panel) with an `h2`: on pages whose top-level panels are the sections under
 * the `h1` (console scenario, guard rule, wallet cards), so the outline never jumps from h1 to h3.
 * Same markup and classes otherwise.
 */
export function PanelHeading({ id, title, actions, className }: { id?: string; title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-3", className)}>
      <Label as="h2" id={id}>
        {title}
      </Label>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
