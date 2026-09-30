import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Label } from "@/design/ui/label";
import { Logo } from "@/design/ui/logo";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import { addrUrl, DEPLOYMENT } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { WinnerBadge } from "./winner-badge";

export const GITHUB_URL = "https://github.com/mryavascann/kaskad";

function External({ href: url, hint, children }: { href: string; hint: string; children: ReactNode }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1 text-fg-2 transition-colors duration-(--dur-fast) hover:text-fg-1"
    >
      {children}
      <ArrowUpRight className="size-3.5 text-fg-3 transition-colors group-hover:text-fg-1" aria-hidden />
      <span className="sr-only">({hint})</span>
    </a>
  );
}

export function SiteFooter({ locale, t }: { locale: Locale; t: CommonMessages }) {
  const f = t.footer;
  const fmt = formatters(locale);
  const contracts = (Object.keys(f.contractNames) as (keyof typeof f.contractNames)[])
    .map((key) => ({ key, name: f.contractNames[key], address: DEPLOYMENT.contracts[key] }))
    .filter((c): c is typeof c & { address: string } => Boolean(c.address));

  return (
    <footer className="mt-auto border-t border-line">
      <div className="page-shell grid-page gap-y-12 py-14">
        <div className="col-span-full flex flex-col gap-5 lg:col-span-4">
          <Link href={href("home", locale)} className="w-fit rounded-control">
            <Logo size={22} label={t.brand} />
          </Link>
          <p className="max-w-sm text-body-sm text-fg-2">{f.tagline}</p>
          <WinnerBadge label={t.badge.winner} event={t.badge.event} className="w-fit" />
        </div>

        <div className="col-span-full flex flex-col gap-4 md:col-span-5 lg:col-span-5">
          <Label as="h2">{f.contracts}</Label>
          <ul className="flex flex-col gap-2.5">
            {contracts.map((c) => (
              <li key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-body-sm">
                <span className="text-fg-3">{c.name}</span>
                <External href={addrUrl(c.address)} hint={f.externalHint}>
                  <code className="font-mono text-caption">{shortAddr(c.address)}</code>
                </External>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-full flex flex-col gap-4 md:col-span-3 lg:col-span-3">
          <Label as="h2">{f.builtWith}</Label>
          <ul className="flex flex-col gap-2 text-body-sm text-fg-2">
            {f.tools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
          <Label as="h2" className="mt-4">{f.source}</Label>
          <External href={GITHUB_URL} hint={f.externalHint}>
            <span className="text-body-sm">{f.github}</span>
          </External>
        </div>

        <p className="col-span-full border-t border-line pt-6 label-mono text-fg-3">
          {f.snapshot}: <span lang="en">{f.snapshotSource}</span>, {f.snapshotBlock} {fmt.block(DEPLOYMENT.source.block)} ·{" "}
          {t.network.name} {DEPLOYMENT.chainId}
        </p>
      </div>
    </footer>
  );
}
