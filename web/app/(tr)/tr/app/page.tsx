import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import { ConsolePage } from "@/views/console/console-page";
import { keepLastPageOnMissingPreview, loadInitialPreview } from "@/views/console/data";

const t = consoleMessages.tr.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("app") } };

// The default preset's free preview (and its per-position replay) is read from Monad testnet when the
// page is built, then again at most every 10 minutes; preset facts use the render time (days to a PT
// maturity). A regeneration that cannot read the preview throws, so the last generated page stays.
export const revalidate = 600;

export default async function Page() {
  return <ConsolePage locale="tr" initial={keepLastPageOnMissingPreview(await loadInitialPreview())} />;
}
