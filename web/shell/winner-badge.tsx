import { Award } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { cn } from "@/lib/utils";

/**
 * "Winner · Monad Blitz İstanbul v2" (1st place, confirmed by the team). The event name keeps
 * lang="en": the badge is uppercase, and Turkish casing would render "Blitz" as "BLİTZ".
 */
export function WinnerBadge({ label, event, className }: { label: string; event: string; className?: string }) {
  return (
    <Badge tone="monad" variant="outline" mono icon={Award} className={cn("whitespace-nowrap", className)}>
      {label} · <span lang="en">{event}</span>
    </Badge>
  );
}
