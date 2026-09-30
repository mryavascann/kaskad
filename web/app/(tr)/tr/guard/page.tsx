import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";
import { PagePlaceholder } from "@/shell/page-placeholder";

const title = commonMessages.tr.nav.guard;

export const metadata: Metadata = { title, alternates: { languages: languageAlternates("guard") } };

export default function Page() {
  return <PagePlaceholder locale="tr" title={title} />;
}
