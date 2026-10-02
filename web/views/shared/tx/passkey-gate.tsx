"use client";

import { Fingerprint } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import type { Locale } from "@/i18n/config";
import { consoleMessages } from "@/i18n/messages/console";
import { useSigner } from "@/lib/chain/hooks/useSigner";
import { useSignerConnect } from "@/lib/chain/hooks/useSignerConnect";

type Props = {
  locale: Locale;
  /** The action that sends a transaction, shown once a passkey is signed in. */
  children: ReactNode;
  /** Sign-in button text (default: "Sign in with passkey to prove"). */
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * Two clicks with a passkey wallet: while Mera is the signer and nobody has signed in, the action is
 * replaced by "Sign in with passkey" (a click of its own: Safari shows the passkey sheet only for a
 * direct user gesture). Once signed in, `children` (the real action) takes its place. Other signers
 * (development builds) pass straight through.
 */
export function PasskeyGate({ locale, children, label, variant = "primary", size = "lg", className }: Props) {
  const t = consoleMessages[locale].signer;
  const signer = useSigner();
  const conn = useSignerConnect();
  if (signer.kind !== "mera" || signer.address) return <>{children}</>;
  return (
    <>
      <Button
        variant={variant}
        size={size}
        loading={conn.busy}
        onClick={() => void conn.signIn()}
        onPointerEnter={conn.preloadSignIn}
        onFocus={conn.preloadSignIn}
        className={className}
      >
        <Fingerprint aria-hidden />
        {label ?? t.signInToProve}
      </Button>
      {conn.error && <Callout tone="liq" title={t.errors[conn.error.code]} className="py-2.5" />}
    </>
  );
}
