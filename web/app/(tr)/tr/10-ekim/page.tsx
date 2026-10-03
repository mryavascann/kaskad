import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { replayMessages } from "@/i18n/messages/replay";
import { ReplayPage } from "@/views/replay/replay-page";

const t = replayMessages.tr.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("replay") } };

// Fully static: every number comes from lib/chain/oct10-replay.json (scripts/src/replay).
export default function Page() {
  return <ReplayPage locale="tr" />;
}
