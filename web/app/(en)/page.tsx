import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";
import { PagePlaceholder } from "@/shell/page-placeholder";

export const metadata: Metadata = { alternates: { languages: languageAlternates("home") } };

export default function Page() {
  return <PagePlaceholder locale="en" title={commonMessages.en.meta.title} />;
}
