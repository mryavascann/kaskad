import { ArrowUpRight } from "lucide-react";
import { Footnote } from "@/design/ui/footnote";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { landingMessages } from "@/i18n/messages/landing";
import type { RiskCell, RiskMap, RiskRow } from "@/lib/chain/risk-map";
import { symbolParts } from "@/lib/chain/scenario";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";

/**
 * Severity 0-4 on the design system's `sev` scale, by share of the book's debt. Bad debt is a realised
 * loss, so it reaches the top step on a smaller share than stuck debt (which a patient, capitalised
 * liquidator could still clear). A cell takes the higher of the two, so a few dollars of bad debt next
 * to $97M stuck does not repaint it.
 */
export function severity(c: RiskCell, debtUsd: number): 0 | 1 | 2 | 3 | 4 {
  const bad = debtUsd > 0 ? c.badDebtUsd / debtUsd : 0;
  const stuck = debtUsd > 0 ? c.stuckDebtUsd / debtUsd : 0;
  const fromBad = c.badDebtUsd < 1 ? 0 : bad >= 0.05 ? 4 : bad >= 0.005 ? 3 : 1;
  const fromStuck = c.stuckDebtUsd < 1 ? 0 : stuck >= 0.3 ? 3 : stuck >= 0.05 ? 2 : 1;
  return Math.max(fromBad, fromStuck) as 0 | 1 | 2 | 3 | 4;
}

const TINT = ["bg-elev-1", "bg-sev-1/12", "bg-sev-2/16", "bg-sev-3/20", "bg-sev-4/24"] as const;
const INK = ["text-fg-3", "text-sev-1", "text-sev-2", "text-sev-3", "text-sev-4"] as const;

function Cell({ c, row, locale, finding }: { c: RiskCell; row: RiskRow; locale: Locale; finding: boolean }) {
  const t = landingMessages[locale].riskMap;
  const fmt = formatters(locale);
  const sev = severity(c, row.debtUsd);
  const bad = c.badDebtUsd >= 1;
  const stuck = c.stuckDebtUsd >= 1;
  // The larger amount leads; the other follows on its own line.
  const badLeads = bad && (!stuck || c.badDebtUsd >= c.stuckDebtUsd);
  return (
    <td className={cn("relative border-l border-line px-3 py-3 align-top", TINT[sev], finding && "outline-2 -outline-offset-2 outline-fg-1")} data-severity={sev}>
      {bad || stuck ? (
        <div className="flex flex-col gap-0.5">
          <span className={cn("font-mono text-body-sm font-medium", INK[sev])}>{fmt.usd(badLeads ? c.badDebtUsd : c.stuckDebtUsd)}</span>
          <span className="text-caption text-fg-3">{badLeads ? t.bad : t.stuck}</span>
          {bad && stuck && (
            <span className="font-mono text-caption text-fg-3">
              + {fmt.usd(badLeads ? c.stuckDebtUsd : c.badDebtUsd)} {badLeads ? t.stuck : t.bad}
            </span>
          )}
        </div>
      ) : (
        <span className="text-caption text-fg-3">{t.clear}</span>
      )}
    </td>
  );
}

/**
 * "The risk map": every real book × the map's shocks, server-rendered (no client code). The cell of the
 * landing's finding is outlined: it is the one checked against the chain before the map is shown.
 */
export function RiskMapTable({ locale, map, finding }: { locale: Locale; map: RiskMap; finding: { assetId: number; shockBps: number } }) {
  const t = landingMessages[locale].riskMap;
  const fmt = formatters(locale);
  const groups = (["monad", "ethereum"] as const).map((g) => ({ g, rows: map.rows.filter((r) => r.group === g) })).filter((x) => x.rows.length > 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto rounded-panel border border-line-2">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <caption className="sr-only">{t.caption({ steps: fmt.int(map.steps), rounds: fmt.int(map.rounds) })}</caption>
          <thead className="bg-elev-2 text-caption text-fg-3">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-normal">
                {t.book}
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">
                {t.debt}
              </th>
              {map.shocksBps.map((bps) => (
                <th key={bps} scope="col" className="border-l border-line px-3 py-2.5 font-mono font-normal">
                  {t.shock({ shock: fmt.pct(bps / 10_000, 0) })}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map(({ g, rows }) => (
            <tbody key={g} className="divide-y divide-line border-t border-line-2">
              <tr>
                <th scope="colgroup" colSpan={map.shocksBps.length + 2} className="bg-bg px-3 py-2 text-left text-caption font-medium tracking-wide text-fg-2 uppercase">
                  {g === "monad" ? t.monad : t.ethereum}
                </th>
              </tr>
              {rows.map((row) => {
                const asset = DEPLOYMENT.assets[String(row.assetId)];
                const name = asset ? symbolParts(asset).base : row.symbol;
                return (
                  <tr key={row.assetId}>
                    <th scope="row" className="px-3 py-3 text-left align-top font-normal">
                      <span className="block text-body-sm font-medium text-fg-1">{name}</span>
                      <span className="text-caption text-fg-3">{t.positions({ n: fmt.int(row.positions) })}</span>
                    </th>
                    <td className="px-3 py-3 text-right align-top font-mono text-body-sm text-fg-2">{fmt.usd(row.debtUsd)}</td>
                    {row.cells.map((c) => (
                      <Cell key={c.shockBps} c={c} row={row} locale={locale} finding={row.assetId === finding.assetId && c.shockBps === finding.shockBps} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-caption text-fg-2">
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm bg-sev-4/60" />
          {t.legendBad}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm bg-sev-2/60" />
          {t.legendStuck}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm border border-line-2 bg-elev-1" />
          {t.legendClear}
        </li>
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Footnote>{t.method}</Footnote>
        <a href={href("app", locale)} className="inline-flex shrink-0 items-center gap-1 text-body-sm text-fg-1 hover:underline">
          {t.open}
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
