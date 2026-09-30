import { formatters } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";
import { findingScenario } from "@/lib/chain/finding";

/** The site description with the finding's shock (syrupUSDC preset, e.g. "3%" / "%3") from the scenario, not typed into the copy. */
export function siteDescription(locale: Locale): string {
  const shock = formatters(locale).pct(findingScenario().shockBps / 10_000, 0);
  return commonMessages[locale].meta.description.replace("{shock}", shock);
}
