import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { landingMessages } from "@/i18n/messages/landing";
import { loadLanding } from "@/views/landing/data";
import { Landing } from "@/views/landing/landing";

export const metadata: Metadata = {
  description: landingMessages.en.meta.description,
  alternates: { languages: languageAlternates("home") },
};

// The finding, its per-position replay, the scale proof and the Guard markets are read from Monad
// testnet (free eth_calls) when the page is built, then again at most every 10 minutes.
export const revalidate = 600;

export default async function Page() {
  return <Landing locale="en" data={await loadLanding()} />;
}
