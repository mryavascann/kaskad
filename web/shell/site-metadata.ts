import type { Metadata } from "next";
import { formatters } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";
import { findingScenario } from "@/lib/chain/finding";

/** The live production site, used when Vercel's production URL is not in the environment. */
export const FALLBACK_SITE_URL = "https://kaskad42.vercel.app";

/**
 * The base for absolute metadata URLs (OG images, alternates): Vercel's production domain when the
 * build runs there (`VERCEL_PROJECT_PRODUCTION_URL`, a host without a scheme), else the live site.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return new URL(host ? `https://${host}` : FALLBACK_SITE_URL);
}

/** The site description with the finding's shock (syrupUSDC preset, e.g. "3%" / "%3") from the scenario, not typed into the copy. */
export function siteDescription(locale: Locale): string {
  const shock = formatters(locale).pct(findingScenario().shockBps / 10_000, 0);
  return commonMessages[locale].meta.description.replace("{shock}", shock);
}

const OG_LOCALE: Record<Locale, string> = { en: "en_US", tr: "tr_TR" };

/** The metadata each root layout shares; pages add their title, description and OG image. */
export function rootMetadata(locale: Locale): Metadata {
  const t = commonMessages[locale].meta;
  return {
    metadataBase: siteUrl(),
    title: { default: t.title, template: "%s · Kaskad" },
    description: siteDescription(locale),
    applicationName: "Kaskad",
    openGraph: { siteName: "Kaskad", locale: OG_LOCALE[locale], type: "website" },
    twitter: { card: "summary_large_image" },
  };
}
