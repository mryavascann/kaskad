"use client";

/**
 * The phone menu sheet, loaded on demand by `MobileMenu`: the page links, search (⌘K), sound, the CTA
 * and the network status. A Radix Dialog: focus trapped inside, Escape and the backdrop close it, and
 * focus returns to the menu button.
 */
import { usePathname } from "next/navigation";
import type { RefObject } from "react";
import { Search } from "lucide-react";
import { soundToggleClass } from "@/audio/sound-toggle-styles";
import { SoundToggle } from "@/audio/sound-toggle";
import { openCommandMenu, preloadCommandMenu } from "@/command/command-menu";
import { ShortcutHint } from "@/command/shortcut-hint";
import { ButtonArrow } from "@/design/ui/button-arrow";
import { ButtonLink } from "@/design/ui/button-link";
import { Dialog, DialogContent, DialogTitle } from "@/design/ui/dialog";
import { IntentLink as Link } from "@/design/ui/intent-link";
import { href, matchRoute, type Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { useNavLive } from "./live-status";
import { NAV_LINKS } from "./nav-links";
import { NetworkStatus } from "./network-status";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  t: CommonMessages;
  /** The menu button: focus goes back there on close (phones don't focus a tapped button). */
  returnFocus: RefObject<HTMLButtonElement | null>;
};

export default function MobileMenuSheet({ open, onOpenChange, locale, t, returnFocus }: SheetProps) {
  const current = matchRoute(usePathname() ?? "/")?.route;
  const live = useNavLive();
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.nav.closeMenu}
        className="lg:hidden"
        onCloseAutoFocus={(event) => {
          if (!returnFocus.current?.isConnected) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <DialogTitle className="label-mono text-fg-3">{t.nav.menu}</DialogTitle>
        <nav aria-label={t.nav.label} className="mt-4">
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {NAV_LINKS.map(({ route, key }) => (
              <li key={route}>
                <Link
                  href={href(route, locale)}
                  aria-current={current === route ? "page" : undefined}
                  onClick={close}
                  className="flex min-h-12 items-center justify-between py-3 text-title-3 text-fg-2 aria-[current=page]:text-fg-1"
                >
                  {t.nav[key]}
                  <span aria-hidden className="text-fg-4">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          aria-haspopup="dialog"
          onPointerEnter={preloadCommandMenu}
          onFocus={preloadCommandMenu}
          onClick={() => {
            close();
            openCommandMenu();
          }}
          className="mt-4 flex min-h-12 w-full items-center gap-3 rounded-control border border-line-2 px-3 text-body-sm text-fg-2 transition-colors duration-(--dur-fast) hover:border-line-3 hover:text-fg-1"
        >
          <Search className="size-4 text-fg-3" aria-hidden />
          <span className="flex-1 text-left">{t.command.open}</span>
          <ShortcutHint t={t.command} className="hidden sm:inline-flex" />
        </button>
        <SoundToggle t={t.sound} showLabel className={soundToggleClass({ showLabel: true, className: "mt-2" })} />
        <div className="mt-6 flex flex-col gap-4">
          <ButtonLink href={href("app", locale)} variant="primary" size="lg" onClick={close}>
            {t.nav.cta}
            <ButtonArrow />
          </ButtonLink>
          <NetworkStatus live={live} locale={locale} t={t.network} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
