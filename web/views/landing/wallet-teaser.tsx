"use client";

/**
 * Wallet teaser: an address field that opens the wallet page with `?address=` (validated with viem
 * `isAddress` first, so nothing unchecked reaches the URL), and sample borrowers from `SAMPLES`.
 */
import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isAddress } from "viem";
import { Button } from "@/design/ui/button";
import { chipStyles } from "@/design/ui/chip";
import { Field } from "@/design/ui/field";
import { addressInputProps, Input } from "@/design/ui/input";
import { href, type Locale } from "@/i18n/config";
import { landingMessages } from "@/i18n/messages/landing";
import { SAMPLES } from "@/lib/chain/wallet";
import { shortAddr } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";

/** `/wallet?address=0x…` (or `/tr/cuzdan?address=…`) for a checked address. */
export function walletHref(locale: Locale, address: string): string {
  return `${href("wallet", locale)}?address=${encodeURIComponent(address)}`;
}

export function WalletTeaser({ locale }: { locale: Locale }) {
  const t = landingMessages[locale].wallet;
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = value.trim();
    if (!isAddress(address, { strict: false })) {
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
          {SAMPLES.map((s) => (
            <li key={s.id}>
              <Link href={walletHref(locale, s.address)} className={cn(chipStyles({ size: "md" }), "gap-2")}>
                <span>{t.sampleNames[s.id] ?? s.description}</span>
                <code className="font-mono text-caption text-fg-3">{shortAddr(s.address)}</code>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
