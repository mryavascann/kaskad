import { ArrowUpRight } from "lucide-react";
import { Eyebrow } from "@/design/ui/label";
import type { Locale } from "@/i18n/config";
import { perpsMessages } from "@/i18n/messages/perps";
import { PERPL_API, PERPL_EXCHANGE } from "@/lib/kaskad/perpl";
import { PerpsPanel } from "./perps-panel";
import { PerplWalletPanel } from "./perpl-wallet-panel";

const MONADSCAN = "https://monadscan.com";

function Source({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 font-mono text-caption text-fg-2 hover:text-fg-1">
      {children}
      <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
    </a>
  );
}

export function PerpsPage({ locale }: { locale: Locale }) {
  const t = perpsMessages[locale];
  return (
    <div className="page-shell pb-16">
      <header className="max-w-4xl pt-16 pb-12 lg:pt-24">
        <Eyebrow>{t.hero.kicker}</Eyebrow>
        <h1 className="mt-6 text-display text-fg-1">{t.hero.title}</h1>
        <p className="mt-6 max-w-2xl text-lead text-fg-2">{t.hero.lead}</p>
      </header>

      <PerpsPanel locale={locale} />

      <section aria-labelledby="perps-method" className="mt-16 flex flex-col gap-6 border-t border-line pt-10">
        <h2 id="perps-method" className="text-title-2 text-fg-1">
          {t.assumptions.title}
        </h2>
        <ul className="flex max-w-doc list-disc flex-col gap-2 pl-5 text-body text-fg-2">
          {t.assumptions.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <span className="label-mono text-fg-3">{t.assumptions.sources}</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Source href={`${MONADSCAN}/address/${PERPL_EXCHANGE}`}>{t.assumptions.contract}</Source>
            <Source href={`${PERPL_API}/v1/pub/context`}>{t.assumptions.api}</Source>
          </div>
        </div>
      </section>

      <PerplWalletPanel locale={locale} />
    </div>
  );
}
