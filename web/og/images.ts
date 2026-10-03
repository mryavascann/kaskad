/**
 * One entry per page for the `opengraph-image.tsx` route files: live data → card → PNG. The route
 * files only export metadata (`alt`, `size`, `contentType`, `revalidate`) and call these.
 */
import type { Locale } from "@/i18n/config";
import { ogCopy } from "./copy";
import { loadFinding, loadGuard, snapshotBlock } from "./data";
import { findingCard, guardCard, staticCard } from "./format";
import { renderOgCard } from "./render";

export { ogAlt } from "./copy";
export { OG_CONTENT_TYPE, OG_SIZE } from "./render";

export async function findingImage(page: "home" | "app", locale: Locale) {
  return renderOgCard(findingCard(page, locale, await loadFinding()), ogCopy[locale].brand);
}

export async function guardImage(locale: Locale) {
  return renderOgCard(guardCard(locale, await loadGuard()), ogCopy[locale].brand);
}

export async function staticImage(page: "wallet" | "perps" | "replay" | "how", locale: Locale) {
  return renderOgCard(staticCard(page, locale, snapshotBlock()), ogCopy[locale].brand);
}
