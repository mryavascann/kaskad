import { Disclosure } from "@/design/ui/disclosure";
import { HonestyTag } from "@/design/ui/honesty";
import { Label } from "@/design/ui/label";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { depthNote, recoveryWhy, splitNote } from "@/i18n/messages/data-notes";
import { assetFacts, daysToMaturity, effectiveResolution, isCalibratedRun, oracleMode } from "@/lib/chain/scenario";
import type { Settings } from "@/lib/chain/types";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { memo } from "react";

function Row({ label, value, tag, children }: { label: string; value?: string; tag?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-body-sm text-fg-1">{label}</span>
        <span className="flex items-center gap-2">
          {value && <span className="font-mono text-body-sm text-fg-1">{value}</span>}
          {tag}
        </span>
      </div>
      {children && <div className="text-caption text-fg-3">{children}</div>}
    </li>
  );
}

/**
 * The honesty labels of the current settings, always on screen next to the inputs: which book
 * (real Aave positions or the synthetic sample), the oracle model, the pool depth (measured or
 * assumed, with its source), the arbitrage recovery assumption, Ethereum data and PT maturity.
 * `nowMs` is fixed by the server so the markup is deterministic.
 */
export const RunAssumptions = memo(function RunAssumptions({ locale, settings, nowMs }: { locale: Locale; settings: Settings; nowMs: number }) {
  const t = consoleMessages[locale].honesty;
  const fmt = formatters(locale);
  const a = assetFacts(settings.assetId);
  if (!a) return null;
  const calibrated = isCalibratedRun(settings);
  const mode = oracleMode(settings.feedback);
  const depth = depthNote({ depthUsd: a.depth.usd, depthIsAssumption: a.depth.isAssumption, depthNote: a.depth.note }, locale);
  const note = splitNote(depth.text);
  const why = recoveryWhy(a.id, locale);
  const days = a.maturity ? daysToMaturity(a.maturity, new Date(nowMs)) : null;

  return (
    <section aria-labelledby="run-assumptions" className="flex flex-col gap-3">
      <Label as="h3" id="run-assumptions">
        {t.title}
      </Label>
      <ul className="flex flex-col divide-y divide-line rounded-panel border border-line-2 bg-bg px-4 py-3.5">
        {calibrated ? (
          <Row label={t.synthetic({ positions: fmt.int(effectiveResolution(settings)) })} tag={<HonestyTag kind="synthetic">{t.tags.synthetic}</HonestyTag>}>
            {t.syntheticNote}
          </Row>
        ) : a.chain === "monad" ? (
          <Row label={t.realMonad({ borrowers: fmt.int(DEPLOYMENT.source.borrowersWithDebt) })} tag={<HonestyTag kind="real">{t.tags.real}</HonestyTag>}>
            {t.realMonadNote({ positions: fmt.int(a.realPositions), symbol: a.baseSymbol, block: fmt.block(DEPLOYMENT.source.block) })}
          </Row>
        ) : (
          <Row label={t.realEthereum({ positions: fmt.int(a.realPositions) })} tag={<HonestyTag kind="real">{t.tags.real}</HonestyTag>} />
        )}

        <Row label={t.oracle[mode]} tag={<HonestyTag kind="model">{t.tags.model}</HonestyTag>}>
          {t.oracleNote[mode]}
        </Row>

        <Row
          label={t.depth}
          value={fmt.usd(a.depth.usd)}
          tag={<HonestyTag kind={a.depth.isAssumption ? "assumption" : "measured"}>{a.depth.isAssumption ? t.assumption : t.measured}</HonestyTag>}
        >
          <span lang={depth.lang === locale ? undefined : depth.lang}>{note.summary}</span>
          {note.rest && (
            <Disclosure summary={t.more} className="mt-1 text-caption">
              <p lang={depth.lang === locale ? undefined : depth.lang} className="text-caption break-words text-fg-3">
                {note.rest}
              </p>
            </Disclosure>
          )}
        </Row>

        {!calibrated && (
          <Row
            label={t.recovery}
            value={a.recovery ? t.recoveryValue({ pct: fmt.pct(a.recovery.bps / 10_000, 0) }) : undefined}
            tag={<HonestyTag kind="assumption">{t.assumption}</HonestyTag>}
          >
            {why ? <span lang={why.lang === locale ? undefined : why.lang}>{why.text}</span> : t.recoveryNone}
          </Row>
        )}

        {a.chain === "ethereum" && (
          <Row label={t.ethereum} tag={<HonestyTag kind="estimate">{t.tags.simulated}</HonestyTag>}>
            {t.ethereumNote}
          </Row>
        )}

        {a.maturity && days !== null && (
          <Row
            label={
              days >= 0
                ? t.maturity({ symbol: a.baseSymbol, date: fmt.date(new Date(`${a.maturity}T00:00:00Z`)), days: fmt.int(days) })
                : t.matured({ symbol: a.baseSymbol, date: fmt.date(new Date(`${a.maturity}T00:00:00Z`)) })
            }
          />
        )}
      </ul>
    </section>
  );
});
