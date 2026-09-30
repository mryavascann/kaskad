/**
 * The wallet teaser as static server HTML (no client code): the markup of the live `WalletTeaser`
 * (./wallet-teaser.tsx) at its first render, as a plain GET form to the wallet page and plain links
 * to the sample borrowers, so it works without JavaScript. The classes are those `Field`, `Input`
 * (size lg, mono, not invalid) and `Button` (primary, lg) render; `wallet-teaser.test.tsx` checks
 * that both markups stay the same.
 */
import { ArrowRight, Wallet } from "lucide-react";
import { buttonStyles } from "@/design/ui/button-styles";
import { chipStyles } from "@/design/ui/chip";
import { href, type Locale } from "@/i18n/config";
import { landingMessages } from "@/i18n/messages/landing";
import { cn } from "@/lib/utils";
import { WALLET_INPUT_ID, walletHref, type WalletSample } from "./wallet-links";

/** `Input`'s shell at size lg, valid, without trailing actions. */
const SHELL = cn(
  "relative flex w-full min-w-0 cursor-text items-center rounded-control border bg-bg text-fg-1",
  "transition-[border-color,background-color] duration-(--dur-fast) ease-out-quart",
  "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-monad-hi",
  "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-45",
  "h-13 gap-3 pl-4",
  "border-line-strong hover:border-fg-3 has-[input:focus-visible]:border-fg-3",
  "pr-4",
);

/** `Input`'s <input> at size lg, mono. */
const INPUT = cn(
  "h-full min-w-0 flex-1 bg-transparent text-fg-1 outline-none placeholder:text-fg-3 disabled:cursor-not-allowed",
  "[&::-webkit-search-cancel-button]:hidden",
  "font-mono",
  "text-body",
);

export function WalletTeaserStatic({ locale, samples }: { locale: Locale; samples: readonly WalletSample[] }) {
  const t = landingMessages[locale].wallet;
  return (
    <div className="flex flex-col gap-6">
      <form action={href("wallet", locale)} method="get" noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={cn("flex min-w-0 flex-col", "flex-1")}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <label htmlFor={WALLET_INPUT_ID} className="text-body-sm font-medium text-fg-1">
              {t.field}
            </label>
          </div>
          <div className={SHELL}>
            <span aria-hidden className="flex shrink-0 text-fg-3 [&_svg]:size-4">
              <Wallet />
            </span>
            <input
              id={WALLET_INPUT_ID}
              className={INPUT}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              inputMode="text"
              name="address"
              placeholder={t.placeholder}
              defaultValue=""
            />
          </div>
          <div aria-live="polite" />
        </div>
        <button type="submit" className={cn(buttonStyles({ variant: "primary", size: "lg" }), "sm:mt-7")}>
          {t.submit}
          <ArrowRight aria-hidden />
        </button>
      </form>
      <div className="flex flex-col gap-2.5">
        <p className="label-mono text-fg-3" id="landing-samples">
          {t.samples}
        </p>
        <ul aria-labelledby="landing-samples" className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <li key={s.id}>
              <a href={walletHref(locale, s.address)} className={cn(chipStyles({ size: "md" }), "gap-2")}>
                <span>{t.sampleNames[s.id] ?? s.description}</span>
                <code className="font-mono text-caption text-fg-3">{s.short}</code>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
