"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, ButtonArrow } from "@/design/ui/button";
import { ButtonLink } from "@/design/ui/button-link";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/design/ui/dialog";
import { Logo } from "@/design/ui/logo";
import { href, matchRoute, type Locale, type RouteId } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { useLiveBlock } from "@/lib/chain/hooks/useLiveBlock";
import { cn } from "@/lib/utils";
import { LocaleSwitch } from "./locale-switch";
import { NetworkStatus } from "./network-status";

const LINKS: { route: RouteId; key: keyof CommonMessages["nav"] }[] = [
  { route: "app", key: "console" },
  { route: "wallet", key: "wallet" },
  { route: "guard", key: "guard" },
  { route: "how", key: "how" },
];

export function SiteNav({ locale, t }: { locale: Locale; t: CommonMessages }) {
  const pathname = usePathname() ?? "/";
  const current = matchRoute(pathname)?.route;
  const [open, setOpen] = useState(false);
  // One poller for both copies of the network status (desktop bar and mobile sheet).
  const live = useLiveBlock();

  return (
    <header className="sticky top-0 z-(--z-nav) border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="page-shell flex h-(--nav-h) items-center gap-6 lg:gap-8">
        <Link href={href("home", locale)} className="-m-1 rounded-control p-1" aria-label={`${t.brand}, ${t.nav.label}`}>
          <Logo size={20} animated label={t.brand} />
        </Link>

        <nav aria-label={t.nav.label} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {LINKS.map(({ route, key }) => (
              <li key={route}>
                <Link
                  href={href(route, locale)}
                  aria-current={current === route ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-control px-3 text-body-sm text-fg-2",
                    "transition-colors duration-(--dur-fast) ease-out-quart hover:text-fg-1",
                    "aria-[current=page]:text-fg-1 aria-[current=page]:underline aria-[current=page]:decoration-line-strong aria-[current=page]:underline-offset-8",
                  )}
                >
                  {t.nav[key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <NetworkStatus live={live} locale={locale} t={t.network} className="hidden xl:inline-flex" />
          <LocaleSwitch locale={locale} t={t.locale} />
          <ButtonLink href={href("app", locale)} variant="secondary" size="sm" className="hidden sm:inline-flex">
            {t.nav.cta}
            <ButtonArrow />
          </ButtonLink>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 lg:hidden" aria-label={t.nav.menu}>
                <Menu aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent closeLabel={t.nav.closeMenu} className="lg:hidden">
              <DialogTitle className="label-mono text-fg-3">{t.nav.menu}</DialogTitle>
              <nav aria-label={t.nav.label} className="mt-4">
                <ul className="flex flex-col divide-y divide-line border-y border-line">
                  {LINKS.map(({ route, key }) => (
                    <li key={route}>
                      <Link
                        href={href(route, locale)}
                        aria-current={current === route ? "page" : undefined}
                        onClick={() => setOpen(false)}
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
              <div className="mt-6 flex flex-col gap-4">
                <ButtonLink href={href("app", locale)} variant="primary" size="lg" onClick={() => setOpen(false)}>
                  {t.nav.cta}
                  <ButtonArrow />
                </ButtonLink>
                <NetworkStatus live={live} locale={locale} t={t.network} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
