import { Search } from "lucide-react";
import type { CommonMessages } from "@/i18n/messages/common";
import { cn } from "@/lib/utils";
import { CommandMenuTrigger } from "./command-menu";
import { ShortcutHint } from "./shortcut-hint";

/**
 * The nav's ⌘K button. Server-safe: the markup (icon, label, key hint) and the merged classes are
 * rendered here, and only the `<button>` with its handlers (`CommandMenuTrigger`) is client code.
 * Named by its content, not `aria-label`, so the name contains the visible word ("Search pages,
 * scenarios and addresses" starts with "Search", WCAG 2.5.3). The key hint is announced through
 * `aria-keyshortcuts` instead of being read as part of the name.
 * Without `onOpen` (e.g. from a Server Component) it opens the page's `CommandMenuHost`.
 */
export function CommandMenuButton({ t, onOpen, className }: { t: CommonMessages["command"]; onOpen?: () => void; className?: string }) {
  return (
    <CommandMenuTrigger
      onOpen={onOpen}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-control border border-line-2 px-2 text-body-sm text-fg-3",
        "transition-colors duration-(--dur-fast) ease-out-quart hover:border-line-3 hover:text-fg-1",
        className,
      )}
    >
      <Search className="size-3.5" aria-hidden />
      <span aria-hidden className="hidden 2xl:inline">
        {t.button}
      </span>
      <span className="sr-only">{t.open}</span>
      <ShortcutHint t={t} aria-hidden className="hidden md:inline-flex" />
    </CommandMenuTrigger>
  );
}
