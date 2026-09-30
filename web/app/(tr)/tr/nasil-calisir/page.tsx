import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { howMessages } from "@/i18n/messages/how";
import { HowItWorks } from "@/views/how/how-it-works";

const t = howMessages.tr.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("how") } };

// Proofs are read from Monad testnet when the page is built; re-read hourly in case the RPC was down.
export const revalidate = 3600;

export default function Page() {
  return <HowItWorks locale="tr" />;
}
