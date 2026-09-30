import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/design/ui/panel";
import { Label } from "@/design/ui/label";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import type { HowMessages } from "@/i18n/messages/how";
import type { ProofRecord, ProofResult } from "@/lib/chain/proofs";
import { symbolParts } from "@/lib/chain/scenario";
import { CALIBRATED, DEPLOYMENT, txUrl } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";

function describe(r: ProofRecord, t: HowMessages["proofs"], locale: Locale): string {
  const fmt = formatters(locale);
  const s = r.scenario;
  if (r.kind === "guard" || !s) return t.guard;
  const oracle = s.oracleFeedbackBps > 0 ? t.oracle.pool : t.oracle.external;
  if (r.kind === "monte-carlo") {
    return t.monteCarlo({ paths: fmt.int(r.paths ?? 0n), positions: fmt.int(s.maxPositions), oracle });
  }
  const synthetic = s.assetId >= CALIBRATED;
  const asset = DEPLOYMENT.assets[s.assetId & 0xff];
  return t.cascade({
    asset: asset ? symbolParts(asset).base : `#${s.assetId & 0xff}`,
    shock: fmt.drop(s.shockBps / 10_000, s.shockBps % 100 === 0 ? 0 : 1),
    oracle,
    book: synthetic ? t.book.synthetic : t.book.real,
    positions: fmt.int(r.simulation?.positionsUsed ?? s.maxPositions),
  });
}

function result(r: ProofRecord, t: HowMessages["proofs"], locale: Locale): { text: string; alarm: boolean } {
  const fmt = formatters(locale);
  if (r.simulation) {
    const bad = wadToNum(r.simulation.totalBadDebt);
    return { text: t.cascadeResult({ liquidated: fmt.usd(wadToNum(r.simulation.totalLiquidated)), bad: fmt.usd(bad) }), alarm: bad > 0 };
  }
  if (r.monteCarlo) {
    const worst = wadToNum(r.monteCarlo.worstBadDebt);
    return {
      text: t.monteCarloResult({
        mean: fmt.usd(wadToNum(r.monteCarlo.meanBadDebt)),
        p95: fmt.usd(wadToNum(r.monteCarlo.p95BadDebt)),
        worst: fmt.usd(worst),
      }),
      alarm: worst > 0,
    };
  }
  if (r.guard) {
    return { text: t.guardResult({ ratio: fmt.pct(Number(r.guard.badDebtRatioBps) / 10_000), tripped: r.guard.tripped }), alarm: r.guard.tripped };
  }
  return { text: "—", alarm: false };
}

/** Every proof transaction with its decoded scenario and recorded result. */
export function ProofLedger({ proofs, t, locale }: { proofs: ProofResult[]; t: HowMessages["proofs"]; locale: Locale }) {
  const fmt = formatters(locale);
  return (
    <ol className="flex flex-col gap-3">
      {proofs.map((p) => {
        if (!p.ok) {
          return (
            <li key={p.id}>
              <Panel variant="inset" className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="text-body-sm text-fg-3">{t.failed}</span>
                <TxLink hash={p.hash} label={t.open} />
              </Panel>
            </li>
          );
        }
        const r = p.record;
        const { text, alarm } = result(r, t, locale);
        const engineGas = r.simulation?.gasUsed ?? r.monteCarlo?.gasUsed ?? r.gasUsed;
        return (
          <li key={r.id}>
            <Panel className="grid gap-x-6 gap-y-3 p-4 sm:p-5 md:grid-cols-[9rem_minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1">
                <Label>{t.columns.when}</Label>
                <time dateTime={new Date(r.timestamp).toISOString()} className="font-mono text-body-sm text-fg-2">
                  {fmt.dateShort(new Date(r.timestamp))}
                </time>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-body-sm text-fg-1">{describe(r, t, locale)}</p>
                <p className={cn("font-mono text-body-sm", alarm ? "text-liq-hi" : "text-safe")}>{text}</p>
                <p className="label-mono text-fg-3">
                  {t.columns.gas} {fmt.int(engineGas)}
                </p>
              </div>
              <div className="flex items-start md:justify-end">
                <TxLink hash={r.hash} label={t.open} />
              </div>
            </Panel>
          </li>
        );
      })}
    </ol>
  );
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 font-mono text-caption text-fg-2 transition-colors hover:text-fg-1"
      aria-label={`${label}: ${hash}`}
    >
      {hash.slice(0, 6)}…{hash.slice(-4)}
      <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
    </a>
  );
}
