import { ChevronDown, Wallet } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";

/** The label of the "Switch signer" button (shared with the plain button that stands in before this loads). */
export function SignerMenuLabel({ locale }: { locale: Locale }) {
  return (
    <>
      <Wallet aria-hidden />
      {consoleMessages[locale].signer.connect}
      <ChevronDown aria-hidden className="text-fg-3" />
    </>
  );
}
