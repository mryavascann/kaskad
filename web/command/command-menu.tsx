"use client";

/**
 * ⌘K / Ctrl+K command menu. `useCommandMenu()` owns the open state and the global shortcut;
 * `<CommandMenuButton>` is the nav trigger with the shortcut hint; `<CommandMenu>` mounts the dialog
 * body (./palette, cmdk) only after the first open, and preloads it when the trigger is hovered or
 * focused, so the initial page JS only carries this small file.
 */
import { Search } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore, type ComponentProps } from "react";
import { Kbd, KbdGroup } from "@/design/ui/kbd";
import type { CommonMessages } from "@/i18n/messages/common";
import { cn } from "@/lib/utils";
import type { PaletteProps } from "./palette";

const loadPalette = () => import("./palette");
const Palette = lazy(loadPalette);

/** Starts downloading the palette chunk (hover / focus on the trigger). */
export const preloadCommandMenu = () => void loadPalette().catch(() => {});

/** True for the ⌘K / Ctrl+K chord (no Shift or Alt, so browser and OS shortcuts stay free). */
export function isCommandMenuShortcut(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k";
}

export function useCommandMenu() {
  const [open, setOpen] = useState(false);
  // Mounted after the first open and kept, so closing animates and reopening is instant.
  const [mounted, setMounted] = useState(false);

  const openMenu = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCommandMenuShortcut(e) || e.repeat) return;
      e.preventDefault();
      setMounted(true);
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen, openMenu, mounted };
}

const subscribeNothing = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** "⌘ K" on Apple devices, "Ctrl K" elsewhere. The server renders "Ctrl"; the client corrects it after hydration. */
export function ShortcutHint({ t, className, "aria-hidden": ariaHidden }: { t: CommonMessages["command"]; className?: string; "aria-hidden"?: boolean }) {
  const apple = useSyncExternalStore(subscribeNothing, isApple, () => false);
  return (
    <KbdGroup className={className} aria-hidden={ariaHidden}>
      {apple ? (
        <Kbd size="sm" label={t.shortcutMac}>
          ⌘K
        </Kbd>
      ) : (
        <Kbd size="sm" label={t.shortcutOther}>
          Ctrl K
        </Kbd>
      )}
    </KbdGroup>
  );
}

/**
 * Named by its content, not `aria-label`, so the name contains the visible word ("Search pages,
 * scenarios and addresses" starts with "Search", WCAG 2.5.3). The key hint is announced through
 * `aria-keyshortcuts` instead of being read as part of the name.
 */
export function CommandMenuButton({ t, onOpen, className, ...props }: { t: CommonMessages["command"]; onOpen: () => void } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={onOpen}
      onPointerEnter={preloadCommandMenu}
      onFocus={preloadCommandMenu}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-control border border-line-2 px-2 text-body-sm text-fg-3",
        "transition-colors duration-(--dur-fast) ease-out-quart hover:border-line-3 hover:text-fg-1",
        className,
      )}
      {...props}
    >
      <Search className="size-3.5" aria-hidden />
      <span aria-hidden className="hidden 2xl:inline">
        {t.button}
      </span>
      <span className="sr-only">{t.open}</span>
      <ShortcutHint t={t} aria-hidden className="hidden md:inline-flex" />
    </button>
  );
}

/** Renders the dialog once it has been opened. */
export function CommandMenu({ mounted, ...props }: PaletteProps & { mounted: boolean }) {
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <Palette {...props} />
    </Suspense>
  );
}
