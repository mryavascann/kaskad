"use client";

/**
 * Wallet teaser: an address field that opens the wallet page with `?address=`, and the sample
 * borrowers (`SAMPLES` of lib/chain/wallet, handed over by the server so this chunk carries neither
 * viem nor the wallet math). The field only checks the shape (`0x` + 40 hex digits) before it
 * navigates; the wallet page validates the address again (viem, checksum) before any read.
 *
 * The server renders `WalletTeaserStatic` (./wallet-teaser-static.tsx): the same markup as a plain
 * GET form, which works without JavaScript (the wallet page reads `?address=`). This live teaser
 * takes over after the reader's first intent; the form keeps its `action`, so it degrades the same way.
 */
import { ArrowRight, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/design/ui/button";
import { chipStyles } from "@/design/ui/chip";
import { Field } from "@/design/ui/field";
import { addressInputProps, Input } from "@/design/ui/input";
import { IntentLink } from "@/design/ui/intent-link";
import { href, type Locale } from "@/i18n/config";
import { landingMessages } from "@/i18n/messages/landing";
import { cn } from "@/lib/utils";
import { looksLikeAddress, WALLET_INPUT_ID, walletHref, type WalletSample } from "./wallet-links";

export { looksLikeAddress, walletHref, type WalletSample } from "./wallet-links";

/** What the reader typed into the static form before this teaser took over (the swap replaces its DOM). */
function typedBeforeTakeover(): { value: string; focused: boolean } {
  if (typeof document === "undefined") return { value: "", focused: false };
  const input = document.getElementById(WALLET_INPUT_ID);
  if (!(input instanceof HTMLInputElement)) return { value: "", focused: false };
  return { value: input.value, focused: document.activeElement === input };
}

export function WalletTeaser({ locale, samples }: { locale: Locale; samples: readonly WalletSample[] }) {
  const t = landingMessages[locale].wallet;
  const router = useRouter();
  // The static form's input is still in the document while this first renders: keep what was typed.
  const [before] = useState(typedBeforeTakeover);
  const [value, setValue] = useState(before.value);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (before.focused) input.current?.focus();
  }, [before]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = value.trim();
    if (!looksLikeAddress(address)) {
      setError(true);
      return;
    }
    setError(false);
    router.push(walletHref(locale, address));
  };

  return (
    <div className="flex flex-col gap-6">
      <form action={href("wallet", locale)} method="get" onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field id={WALLET_INPUT_ID} label={t.field} error={error ? t.invalid : undefined} className="flex-1">
          <Input
            {...addressInputProps}
            ref={input}
            name="address"
            size="lg"
            mono
            leading={<Wallet />}
            placeholder={t.placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="sm:mt-7">
          {t.submit}
          <ArrowRight aria-hidden />
        </Button>
      </form>
      <div className="flex flex-col gap-2.5">
        <p className="label-mono text-fg-3" id="landing-samples">
          {t.samples}
        </p>
        <ul aria-labelledby="landing-samples" className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <li key={s.id}>
              <IntentLink href={walletHref(locale, s.address)} className={cn(chipStyles({ size: "md" }), "gap-2")}>
                <span>{t.sampleNames[s.id] ?? s.description}</span>
                <code className="font-mono text-caption text-fg-3">{s.short}</code>
              </IntentLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
