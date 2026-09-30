"use client";

/**
 * Wallet teaser: an address field that opens the wallet page with `?address=`, and the sample
 * borrowers (`SAMPLES` of lib/chain/wallet, handed over by the server so this chunk carries neither
 * viem nor the wallet math). The field only checks the shape (`0x` + 40 hex digits) before it
 * navigates; the wallet page validates the address again (viem, checksum) before any read.
 */
import { ArrowRight, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/design/ui/button";
import { chipStyles } from "@/design/ui/chip";
import { Field } from "@/design/ui/field";
import { addressInputProps, Input } from "@/design/ui/input";
import { IntentLink } from "@/design/ui/intent-link";
import { href, type Locale } from "@/i18n/config";
import { landingMessages } from "@/i18n/messages/landing";
import { cn } from "@/lib/utils";

/** A sample borrower as the server passes it: id (copy key), address and its short form. */
export type WalletSample = { id: string; address: string; short: string; description: string };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Shape check for navigation only: `0x` and 40 hex digits (any case). */
export function looksLikeAddress(value: string): boolean {
  return ADDRESS.test(value);
}

/** `/wallet?address=0x…` (or `/tr/cuzdan?address=…`) for a checked address. */
export function walletHref(locale: Locale, address: string): string {
  return `${href("wallet", locale)}?address=${encodeURIComponent(address)}`;
}

export function WalletTeaser({ locale, samples }: { locale: Locale; samples: readonly WalletSample[] }) {
  const t = landingMessages[locale].wallet;
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

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
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label={t.field} error={error ? t.invalid : undefined} className="flex-1">
          <Input
            {...addressInputProps}
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
