import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages } from "@/i18n/messages/landing";
import { keepLastPageOnPartialRead, loadLanding } from "@/views/landing/data";
import { findingMeta, Landing } from "@/views/landing/landing";

const finding = findingMeta();

export const metadata: Metadata = {
  description: landingMessages.en.meta.description({ asset: finding.asset, shock: formatters("en").pct(finding.shock, 0) }),
  alternates: { languages: languageAlternates("home") },
};

// The finding, its per-position replay, the scale proof and the Guard markets are read from Monad
// testnet (free eth_calls) when the page is built, then again at most every 10 minutes. A regeneration
// that cannot read the hero data throws, so the last generated page stays (see keepLastPageOnPartialRead).
export const revalidate = 600;

export default async function Page() {
  return <Landing locale="en" data={keepLastPageOnPartialRead(await loadLanding())} />;
}
