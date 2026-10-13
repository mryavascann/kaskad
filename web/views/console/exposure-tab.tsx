"use client";

import { ArrowUpRight } from "lucide-react";
import { Button } from "@/design/ui/button";
import { Badge } from "@/design/ui/badge";
import { Callout } from "@/design/ui/callout";
import { Label } from "@/design/ui/label";
import { Skeleton } from "@/design/ui/skeleton";
import type { Tone } from "@/design/ui/tone";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import type { PositionOutcome } from "@/lib/chain/book";
import { useExposure } from "@/lib/chain/hooks/useExposure";
import type { Result, Scenario, Settings } from "@/lib/chain/types";
import { shortAddr } from "@/lib/kaskad/format";
import { shockLabel } from "./model";

/** Rows of the "largest positions reached" table. */
const TABLE_ROWS = 10;
const OUTCOME_TONE: Record<PositionOutcome, Tone> = { liquidated: "warn", stuck: "liq", "bad-debt": "liq", safe: "safe" };
const EXPLORER = { monad: "https://monadscan.com/address/", ethereum: "https://etherscan.io/address/" } as const;

/**
 * "Who is exposed": the cascade on screen joined with the Nansen labels of the borrowers behind each
 * slot (lib/chain/hooks/useExposure). Real books only; the labels come from /api/labels.
 */
export function ExposureTab({ locale, settings, scenario, result }: { locale: Locale; settings: Settings; scenario: Scenario | null; result: Result | null }) {
  const t = consoleMessages[locale].exposure;
  const fmt = formatters(locale);
  const x = useExposure(scenario, result);
  const shock = shockLabel(scenario ? scenario.shockBps / 100 : settings.shockPct, fmt);

  if (!x.eligible) return <Callout tone="neutral" title={t.notEligible} />;
  if (x.error) {
    const msg = { unconfigured: t.unconfigured, "invalid-key": t.invalidKey, "rate-limited": t.rateLimited, "quota-exhausted": t.quotaExhausted, unavailable: t.unavailable, failed: t.failed }[x.error];
    return <div className="flex flex-col items-start gap-4"><Callout tone="warn" title={msg} /><Button variant="secondary" onClick={x.retry}>{t.retry}</Button></div>;
  }
  if (!x.exposure || !x.labels) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <span className="sr-only">{t.loading}</span>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const e = x.exposure;
  const labels = x.labels;
  const top = e.largest?.position;
  const who = (p: { name: string | null; address: string | null }) => p.name ?? (p.address ? shortAddr(p.address) : "—");
  const reached = e.groups.filter((g) => g.hitDebtUsd > 0);
  const lookedUp = labels.entries.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-title-3 text-fg-1">{t.title}</h3>
          <Badge tone="monad" variant="outline" size="sm" mono>
            {t.poweredBy}
          </Badge>
        </div>
        <p className="max-w-2xl text-body-sm text-fg-2">{t.body}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="max-w-3xl text-lead text-fg-1">
          {e.hit.length === 0
            ? t.none({ shock })
            : t.headline({ count: fmt.int(e.hit.length), debt: fmt.usd(e.hitDebtUsd), shock, labelled: fmt.pct(e.labelledHitShare, 0) })}
        </p>
        {top && e.largest && <p className="text-body-sm text-fg-2">{t.largest({ who: who(top), share: fmt.pct(e.largest.share) })}</p>}
      </div>

      {reached.length > 0 && (
        <section aria-labelledby="exposure-groups" className="flex flex-col gap-3">
          <Label as="p" id="exposure-groups">
            {t.groupsTitle}
          </Label>
          <ul className="flex flex-col gap-2">
            {reached.map((g) => {
              const share = e.hitDebtUsd > 0 ? g.hitDebtUsd / e.hitDebtUsd : 0;
              return (
                <li key={g.category} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-body-sm">
                  <span className="truncate text-fg-1">{t.categories[g.category] ?? g.category}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-elev-2" aria-hidden>
                    <span className="block h-full rounded-full bg-liq/70" style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </span>
                  <span className="font-mono text-fg-2">
                    {fmt.usd(g.hitDebtUsd)} · {fmt.pct(share, 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {e.hit.length > 0 && (
        <section aria-labelledby="exposure-table" className="flex flex-col gap-3">
          <Label as="p" id="exposure-table">
            {t.tableTitle}
          </Label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-body-sm">
              <thead className="text-caption text-fg-3">
                <tr>
                  <th className="py-2 pr-3 font-normal">{t.cols.who}</th>
                  <th className="py-2 pr-3 font-normal">{t.cols.category}</th>
                  <th className="py-2 pr-3 text-right font-normal">{t.cols.debt}</th>
                  <th className="py-2 pr-3 font-normal">{t.cols.outcome}</th>
                  <th className="py-2 font-normal">{t.cols.labels}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {e.hit.slice(0, TABLE_ROWS).map((p) => (
                  <tr key={p.index}>
                    <td className="py-3 pr-3">
                      {p.address ? (
                        <a
                          href={`${EXPLORER[labels.chain]}${p.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-1 text-fg-1 hover:underline"
                        >
                          <span className={p.name ? undefined : "font-mono"}>{who(p)}</span>
                          <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-fg-2">{t.categories[!p.lookedUp ? "not-looked-up" : (p.category ?? "unlabelled")]}</td>
                    <td className="py-3 pr-3 text-right font-mono text-fg-1">{fmt.usd(p.debtUsd)}</td>
                    <td className="py-3 pr-3">
                      <Badge tone={OUTCOME_TONE[p.outcome]} variant="outline" size="sm">
                        {t.outcomes[p.outcome]}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.labels.slice(0, 3).map((l) => (
                          <Badge key={l.label} tone="neutral" variant="soft" size="sm">
                            {l.label}
                          </Badge>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="max-w-3xl text-caption text-fg-3">
        {t.foot({
          top: fmt.int(lookedUp),
          total: fmt.int(labels.total),
          block: labels.sourceBlock ? fmt.int(labels.sourceBlock) : null,
          chain: labels.chain === "monad" ? "Monad" : "Ethereum",
        })}
      </p>
    </div>
  );
}
