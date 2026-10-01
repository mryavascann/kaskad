import { Kbd, KbdGroup } from "@/design/ui/kbd";
import type { CommonMessages } from "@/i18n/messages/common";

/**
 * "⌘ K" on Apple devices, "Ctrl K" elsewhere. Server-safe: both keycaps are rendered and CSS shows
 * one, keyed on `html[data-apple]`, which `CommandMenuHost` sets after hydration (so the server and
 * the first client render agree, and the nav needs no client code for the hint).
 */
export function ShortcutHint({ t, className, "aria-hidden": ariaHidden }: { t: CommonMessages["command"]; className?: string; "aria-hidden"?: boolean }) {
  return (
    <KbdGroup className={className} aria-hidden={ariaHidden}>
      <Kbd size="sm" label={t.shortcutMac} className="hidden [[data-apple]_&]:inline-flex">
        ⌘K
      </Kbd>
      <Kbd size="sm" label={t.shortcutOther} className="[[data-apple]_&]:hidden">
        Ctrl K
      </Kbd>
    </KbdGroup>
  );
}
