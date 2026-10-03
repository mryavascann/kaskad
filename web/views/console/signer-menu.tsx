"use client";

import { Fingerprint, KeyRound, Wallet, Zap } from "lucide-react";
import { Button } from "@/design/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/design/ui/popover";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import type { SignerKind } from "@/lib/chain/hooks/useSigner";
import type { useSignerConnect } from "@/lib/chain/hooks/useSignerConnect";
import { DEV_SIGNERS } from "@/lib/chain/signer-mode";
import { SignerMenuLabel } from "./signer-menu-label";

/**
 * "Switch signer": browser wallet, Mera passkey (sign in / create), back to the burner. Its own chunk
 * (Radix Popover, Floating UI), loaded by the signer strip on the reader's first intent. The browser
 * wallet and the burner are development-only (signer-mode.ts); production shows a sign-in button instead.
 */
export function SignerMenu({ locale, conn, kind, defaultOpen }: { locale: Locale; conn: ReturnType<typeof useSignerConnect>; kind: SignerKind; defaultOpen?: boolean }) {
  const t = consoleMessages[locale].signer;
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" loading={conn.busy}>
          <SignerMenuLabel locale={locale} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-2">
        {DEV_SIGNERS && (
          <Button size="sm" variant="ghost" className="justify-start" onClick={() => void conn.connectInjected()} disabled={conn.busy}>
            <Wallet aria-hidden />
            {t.injected}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => void conn.connectMera("login")} disabled={conn.busy}>
          <Fingerprint aria-hidden />
          {t.meraLogin}
        </Button>
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => void conn.connectMera("create")} disabled={conn.busy}>
          <KeyRound aria-hidden />
          {t.meraCreate}
        </Button>
        {DEV_SIGNERS && kind !== "burner" && (
          <Button size="sm" variant="ghost" className="justify-start" onClick={() => conn.selectBurner()}>
            <Zap aria-hidden />
            {t.burner}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
