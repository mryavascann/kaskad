import { ArrowUpRight } from "lucide-react";
import { Eyebrow, Label } from "@/design/ui/label";
import { Panel } from "@/design/ui/panel";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { guardMessages } from "@/i18n/messages/guard";
import { PROOF_TXS, readProof, type ProofRecord } from "@/lib/chain/proofs";
import { txUrl } from "@/lib/kaskad/config";
import { GuardLive } from "./guard-live";
import { RiskOracleLive } from "./risk-oracle-live";

async function guardProof(): Promise<ProofRecord | null> {
  const entry = PROOF_TXS.find((p) => p.id === "guard");
  if (!entry) return null;
  return readProof(entry).catch(() => null);
}

export async function GuardPage({ locale }: { locale: Locale }) {
  const t = guardMessages[locale];
  const fmt = formatters(locale);
  const proof = await guardProof();

  return (
    <div className="page-shell pb-16">
      <header className="max-w-4xl pt-16 pb-12 lg:pt-24">
        <Eyebrow>{t.hero.kicker}</Eyebrow>
        <h1 className="mt-6 text-display text-fg-1">{t.hero.title}</h1>
        <p className="mt-6 max-w-2xl text-lead text-fg-2">{t.hero.lead}</p>
      </header>

      <GuardLive locale={locale} />

      <section aria-labelledby="guard-oracle" className="mt-20 flex flex-col gap-8 border-t border-line pt-12">
        <div className="max-w-3xl">
          <Eyebrow index="01">{t.oracle.title}</Eyebrow>
          <h2 id="guard-oracle" className="mt-4 text-title-1 text-fg-1">
            {t.oracle.title}
          </h2>
          <p className="mt-4 text-body text-fg-2">{t.oracle.lead}</p>
        </div>
        <RiskOracleLive locale={locale} />
      </section>

      <section aria-labelledby="guard-how" className="mt-20 grid-page gap-y-8 border-t border-line pt-12">
        <div className="col-span-full lg:col-span-4">
          <Eyebrow index="02">{t.how.title}</Eyebrow>
          <h2 id="guard-how" className="mt-4 text-title-1 text-fg-1">
            {t.how.title}
          </h2>
          <p className="mt-4 text-body text-fg-2">{t.how.compose}</p>
        </div>
        <ol className="col-span-full grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-2 lg:col-span-8">
          {t.how.steps.map(([title, body], i) => (
            <li key={title} className="flex flex-col gap-2 bg-elev-1 p-5">
              <span className="label-mono text-fg-3">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-title-3 text-fg-1">{title}</h3>
              <p className="text-body-sm text-fg-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="guard-proof" className="mt-16 grid-page gap-y-6 border-t border-line pt-12">
        <div className="col-span-full lg:col-span-4">
          <Eyebrow index="03">{t.proof.title}</Eyebrow>
          <h2 id="guard-proof" className="mt-4 text-title-2 text-fg-1">
            {t.proof.title}
          </h2>
        </div>
        <Panel tone={proof?.guard?.tripped ? "liq" : undefined} className="col-span-full flex flex-wrap items-center justify-between gap-4 p-5 lg:col-span-8">
          {proof?.guard ? (
            <>
              <p className="max-w-xl text-body text-fg-1">
                {t.proof.body({ date: fmt.date(new Date(proof.timestamp)), ratio: fmt.pct(Number(proof.guard.badDebtRatioBps) / 10_000) })}
              </p>
              <a
                href={txUrl(proof.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 font-mono text-caption text-fg-2 hover:text-fg-1"
              >
                <Label className="text-inherit">{t.proof.open}</Label>
                {proof.hash.slice(0, 6)}…{proof.hash.slice(-4)}
                <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
              </a>
            </>
          ) : (
            <p className="text-body-sm text-fg-3">{t.proof.missing}</p>
          )}
        </Panel>
      </section>
    </div>
  );
}
