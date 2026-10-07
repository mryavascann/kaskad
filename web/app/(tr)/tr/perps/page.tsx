import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { perpsMessages } from "@/i18n/messages/perps";
import { PerpsPage } from "@/views/perps/perps-page";

const t = perpsMessages.tr.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("perps") } };

// Static shell; the panel reads Perpl live in the browser through /api/perpl.
export default function Page() {
  return <PerpsPage locale="tr" />;
}
