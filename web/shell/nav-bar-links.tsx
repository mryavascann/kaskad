"use client";

import { usePathname } from "next/navigation";
import { IntentLink as Link } from "@/design/ui/intent-link";
import { href, matchRoute, type Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { NAV_LINKS } from "./nav-links";

const LINK =
  "inline-flex h-9 items-center whitespace-nowrap rounded-control px-3 text-body-sm text-fg-2 transition-colors duration-(--dur-fast) ease-out-quart hover:text-fg-1 " +
  "aria-[current=page]:text-fg-1 aria-[current=page]:underline aria-[current=page]:decoration-line-strong aria-[current=page]:underline-offset-8";

/**
 * The bar's page links. A client island only for `aria-current` (the layout is shared by every page,
 * so the server cannot know which one is current); the `<nav>` around it is server markup.
 */
export function NavBarLinks({ locale, labels }: { locale: Locale; labels: CommonMessages["nav"] }) {
  const current = matchRoute(usePathname() ?? "/")?.route;
  return (
    <ul className="flex items-center gap-1">
      {NAV_LINKS.map(({ route, key }) => (
        <li key={route}>
          <Link href={href(route, locale)} aria-current={current === route ? "page" : undefined} className={LINK}>
            {labels[key]}
          </Link>
        </li>
      ))}
    </ul>
  );
}
