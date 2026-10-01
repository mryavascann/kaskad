"use client";

/**
 * ⌘K / Ctrl+K command menu, client side. Kept small, since the nav on every page loads it:
 * - `useCommandMenu()` owns the open state, the global shortcut and the `openCommandMenu()` event.
 * - `CommandMenuHost` mounts that state once per page (the nav renders it) with the palette.
 * - `CommandMenuTrigger` is a bare `<button>` that opens it; its content and classes come from the
 *   caller (`CommandMenuButton` renders them on the server).
 * - `CommandMenu` mounts the dialog body (./palette, cmdk) only after the first open, and the triggers
 *   preload it on hover or focus.
 */
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useState, type ComponentProps } from "react";
import { matchRoute, type Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PaletteProps } from "./palette";

const loadPalette = () => import("./palette");
const Palette = lazy(loadPalette);

/** Starts downloading the palette chunk (hover / focus on a trigger). */
export const preloadCommandMenu = () => void loadPalette().catch(() => {});

const OPEN_EVENT = "kaskad:command-menu";

/** Opens the page's command menu (from any island: the nav button, the mobile menu). */
export function openCommandMenu(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

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
    window.addEventListener(OPEN_EVENT, openMenu);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, openMenu);
    };
  }, [openMenu]);

  return { open, setOpen, openMenu, mounted };
}

const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** One per page (the nav): the shortcut, the palette, and `html[data-apple]` for `ShortcutHint`. */
export function CommandMenuHost({ locale, t }: { locale: Locale; t: CommonMessages }) {
  const pathname = usePathname() ?? "/";
  const menu = useCommandMenu();
  useEffect(() => {
    if (isApple()) document.documentElement.dataset.apple = "";
  }, []);
  return (
    <CommandMenu
      mounted={menu.mounted}
      open={menu.open}
      onOpenChange={menu.setOpen}
      locale={locale}
      t={t}
      pathname={pathname}
      currentRoute={matchRoute(pathname)?.route ?? null}
    />
  );
}

/** A `<button>` that opens the command menu (`onOpen`, or the page's `CommandMenuHost`). */
export function CommandMenuTrigger({ onOpen, onClick, ...props }: { onOpen?: () => void } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onPointerEnter={preloadCommandMenu}
      onFocus={preloadCommandMenu}
      onClick={(event) => {
        onClick?.(event);
        (onOpen ?? openCommandMenu)();
      }}
      {...props}
    />
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
