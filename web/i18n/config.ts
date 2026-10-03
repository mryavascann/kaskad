/**
 * Locales and localized routes. English lives at the root, Turkish under /tr with Turkish slugs.
 * Each locale has its own root layout (app/(en), app/(tr)), so <html lang> is always right and pages
 * stay static; switching language is a full page load by design.
 */

export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** BCP 47 tag for Intl and <html lang>. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", tr: "tr-TR" };

export const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

/** Every page of the site in both languages. */
export const ROUTES = {
  home: { en: "/", tr: "/tr" },
  app: { en: "/app", tr: "/tr/app" },
  wallet: { en: "/wallet", tr: "/tr/cuzdan" },
  guard: { en: "/guard", tr: "/tr/guard" },
  replay: { en: "/replay", tr: "/tr/10-ekim" },
  how: { en: "/how-it-works", tr: "/tr/nasil-calisir" },
} as const satisfies Record<string, Record<Locale, string>>;

export type RouteId = keyof typeof ROUTES;

export const href = (route: RouteId, locale: Locale): string => ROUTES[route][locale];

/** The route and locale a pathname belongs to (trailing slashes and query strings ignored). */
export function matchRoute(pathname: string): { route: RouteId; locale: Locale } | null {
  const path = pathname.split(/[?#]/)[0].replace(/(.)\/+$/, "$1") || "/";
  for (const route of Object.keys(ROUTES) as RouteId[]) {
    for (const locale of LOCALES) {
      if (ROUTES[route][locale] === path) return { route, locale };
    }
  }
  return null;
}

/** Same page in the other language; the other locale's home when the page has no counterpart. */
export function switchLocalePath(pathname: string, to: Locale): string {
  const match = matchRoute(pathname);
  return match ? href(match.route, to) : href("home", to);
}

/** `alternates.languages` for page metadata (hreflang), including x-default. */
export function languageAlternates(route: RouteId): Record<string, string> {
  return { en: href(route, "en"), tr: href(route, "tr"), "x-default": href(route, DEFAULT_LOCALE) };
}
