import { Eyebrow } from "@/design/ui/label";
import type { Locale } from "@/i18n/config";
import { walletMessages } from "@/i18n/messages/wallet";
import { WalletRisk } from "./wallet-risk";

export function WalletPage({ locale }: { locale: Locale }) {
  const t = walletMessages[locale];
  return (
    <div className="page-shell pb-20">
      <header className="max-w-4xl pt-16 pb-12 lg:pt-24">
        <Eyebrow>{t.hero.kicker}</Eyebrow>
        <h1 className="mt-6 text-display text-fg-1">{t.hero.title}</h1>
        <p className="mt-6 max-w-2xl text-lead text-fg-2">{t.hero.lead}</p>
      </header>
      <WalletRisk locale={locale} />
    </div>
  );
}
