import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

/** Skip link, navigation, main landmark and footer around every site page (not /design). */
export function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = commonMessages[locale];
  return (
    <>
      <a
        href="#main"
        className="fixed top-2 left-4 z-(--z-skip) -translate-y-24 rounded-control bg-fg-1 px-4 py-2 text-body-sm font-medium text-bg transition-transform duration-(--dur-fast) focus-visible:translate-y-0"
      >
        {t.skipToContent}
      </a>
      <SiteNav locale={locale} t={t} />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter locale={locale} t={t} />
    </>
  );
}
