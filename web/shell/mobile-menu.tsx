"use client";

/**
 * The phone menu button. The sheet behind it (`./mobile-menu-sheet`: Radix Dialog, focus trap, the
 * links) is a separate chunk: it loads when the button is touched, hovered or focused, and mounts on
 * the first tap, so the dialog code is not in every page's initial JavaScript.
 */
import { Menu } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";

const loadSheet = () => import("./mobile-menu-sheet");
const Sheet = lazy(loadSheet);
const preload = () => void loadSheet().catch(() => {});

export function MobileMenu({ locale, t, className }: { locale: Locale; t: CommonMessages; className: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={t.nav.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={preload}
        onTouchStart={preload}
        onFocus={preload}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        className={className}
      >
        <Menu aria-hidden />
      </button>
      {mounted && (
        <Suspense fallback={null}>
          <Sheet open={open} onOpenChange={setOpen} locale={locale} t={t} returnFocus={button} />
        </Suspense>
      )}
    </>
  );
}
