import type { Metadata } from "next";
import { languageAlternates } from "@/i18n/config";
import { walletMessages } from "@/i18n/messages/wallet";
import { WalletPage } from "@/views/wallet/wallet-page";

const t = walletMessages.en.meta;

export const metadata: Metadata = { title: t.title, description: t.description, alternates: { languages: languageAlternates("wallet") } };

export default function Page() {
  return <WalletPage locale="en" />;
}
