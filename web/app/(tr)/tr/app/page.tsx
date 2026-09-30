import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import { ConsolePage } from "@/views/console/console-page";

const t = consoleMessages.tr.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("app") } };

// Preset facts use the render time (days to a PT maturity): re-render hourly.
export const revalidate = 3600;

export default function Page() {
  return <ConsolePage locale="tr" />;
}
