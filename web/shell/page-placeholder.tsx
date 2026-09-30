import { SectionHeader } from "@/design/ui/section-header";
import type { Locale } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";

/** Temporary body for routes whose page is built in stage 4b. Removed when the real page lands. */
export function PagePlaceholder({ locale, title }: { locale: Locale; title: string }) {
  const t = commonMessages[locale].placeholder;
  return (
    <div className="page-shell section-y">
      <SectionHeader kicker={t.kicker} title={title} description={t.body} />
    </div>
  );
}
