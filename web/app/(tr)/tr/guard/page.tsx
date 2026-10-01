import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { guardMessages } from "@/i18n/messages/guard";
import { GuardPage } from "@/views/guard/guard-page";

const t = guardMessages.tr.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("guard") } };

// The proof transaction is read at build time; re-read hourly in case the RPC was down.
export const revalidate = 3600;

export default function Page() {
  return <GuardPage locale="tr" />;
}
