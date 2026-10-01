import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonArrow } from "@/design/ui/button-arrow";
import { ButtonLink } from "@/design/ui/button-link";
import { Footnote } from "@/design/ui/footnote";
import { HonestyTag } from "@/design/ui/honesty";
import { Eyebrow, Label } from "@/design/ui/label";
import { Panel } from "@/design/ui/panel";
import { href, type Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { commonMessages } from "@/i18n/messages/common";
import { depthNote, recoveryWhy, splitNote } from "@/i18n/messages/data-notes";
import { howMessages } from "@/i18n/messages/how";
import { ethEstimate, ETH_READ_GAS_PER_POSITION, MONAD_READ_GAS_PER_POSITION } from "@/lib/chain/limits";
import { readProofs, type ProofResult } from "@/lib/chain/proofs";
import { CLOSE_FACTOR, FULL_CLOSE_HF, FULL_CLOSE_MIN_USD } from "@/lib/chain/protocol";
import { BASE_SETTINGS, presetById, ROUNDS_RANGE, STEPS_RANGE, symbolParts } from "@/lib/chain/scenario";
import { addrUrl, DEPLOYMENT, UI_ASSETS } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { ETH_COLD_SLOAD, ETH_TX_GAS_CAP, MONAD_PAGE_SLOTS, MONAD_TX_GAS_LIMIT } from "@/lib/kaskad/math";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import { GITHUB_URL } from "@/shell/site-footer";
import { CascadeLoop, Pipeline } from "./diagrams";
import { ProofLedger } from "./proof-ledger";

const SECTIONS = ["cascade", "method", "data", "assumptions", "monad", "proofs", "verify", "security"] as const;
type SectionId = (typeof SECTIONS)[number];

function Section({ id, index, kicker, title, children }: { id: SectionId; index: number; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-line pt-10 pb-16">
      <Eyebrow index={String(index).padStart(2, "0")}>{kicker}</Eyebrow>
      <h2 id={`${id}-title`} className="mt-4 text-title-1 text-fg-1">
        {title}
      </h2>
      <div className="mt-8 flex flex-col gap-8">{children}</div>
    </section>
  );
}

const prose = "max-w-doc text-body text-fg-2";

export async function HowItWorks({ locale }: { locale: Locale }) {
  const t = howMessages[locale];
  const c = commonMessages[locale];
  const fmt = formatters(locale);
  const proofs: ProofResult[] = await readProofs();

  const finding = presetById("sali").settings;
  const syrup = DEPLOYMENT.assets[String(BASE_SETTINGS.assetId)];
  const maturityAsset = Object.values(DEPLOYMENT.assets).map(symbolParts).find((p) => p.maturity);
  const maturity = maturityAsset?.maturity ? fmt.date(new Date(`${maturityAsset.maturity}T00:00:00Z`)) : null;
  const scale = proofs.find((p) => p.ok && p.record.id === "scale");
  const scaleSim = scale?.ok ? scale.record.simulation : null;

  return (
    <div className="page-shell pb-12">
      <header className="max-w-4xl pt-16 pb-14 lg:pt-24">
        <Eyebrow>{t.hero.kicker}</Eyebrow>
        <h1 className="mt-6 text-display text-fg-1">{t.hero.title}</h1>
        <p className="mt-6 max-w-2xl text-lead text-fg-2">{t.hero.lead({ shock: fmt.pct(finding.shockPct / 100, 0) })}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label={t.toc.label} className="hidden lg:block">
          <div className="sticky top-[calc(var(--nav-h)+2.5rem)] flex flex-col gap-3 pt-10">
            <Label>{t.toc.label}</Label>
            <ol className="flex flex-col">
              {SECTIONS.map((id, i) => (
                <li key={id}>
                  <a href={`#${id}`} className="flex gap-3 py-1 text-body-sm text-fg-2 transition-colors duration-(--dur-fast) hover:text-fg-1">
                    <span className="font-mono text-caption text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                    {t.toc[id]}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0">
          <Section id="cascade" index={1} kicker={t.toc.cascade} title={t.cascade.title}>
            <p className={prose}>{t.cascade.intro}</p>
            <CascadeLoop label={t.cascade.loopLabel} steps={t.cascade.loop} again={t.cascade.again} />
            <Pipeline label={t.cascade.pipelineLabel} nodes={t.cascade.pipeline} />
          </Section>

          <Section id="method" index={2} kicker={t.toc.method} title={t.method.title}>
            <dl className="grid max-w-doc gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2">
              {(
                [
                  [t.method.items.book.term, t.method.items.book.def],
                  [
                    t.method.items.shock.term,
                    t.method.items.shock.def({
                      steps: fmt.int(BASE_SETTINGS.steps),
                      rounds: fmt.int(BASE_SETTINGS.rounds),
                      maxSteps: fmt.int(STEPS_RANGE.max),
                      maxRounds: fmt.int(ROUNDS_RANGE.max),
                    }),
                  ],
                  [
                    t.method.items.rules.term,
                    t.method.items.rules.def({ closeFactor: fmt.pct(CLOSE_FACTOR, 0), hf: fmt.num(FULL_CLOSE_HF, 2), small: fmt.usdFull(FULL_CLOSE_MIN_USD) }),
                  ],
                  [t.method.items.market.term, t.method.items.market.def],
                  [t.method.items.oracle.term, t.method.items.oracle.def],
                  [t.method.items.outputs.term, t.method.items.outputs.def],
                ] as [string, string][]
              ).map(([term, def]) => (
                <div key={term} className="grid gap-2 bg-elev-1 p-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
                  <dt className="label-mono pt-0.5 text-fg-3">{term}</dt>
                  <dd className="text-body-sm text-fg-2">{def}</dd>
                </div>
              ))}
            </dl>
            <Footnote label={c.honesty.measured}>{t.method.oracleCheck}</Footnote>
          </Section>

          <Section id="data" index={3} kicker={t.toc.data} title={t.data.title}>
            <p className={prose}>
              {t.data.borrowers({
                block: fmt.block(DEPLOYMENT.source.block),
                borrowers: fmt.int(DEPLOYMENT.source.borrowersWithDebt),
                debt: fmt.usd(DEPLOYMENT.totals.debtUsd),
                supplied: fmt.usd(DEPLOYMENT.totals.suppliedUsd),
              })}
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-title-3 text-fg-1">{t.data.depthsTitle}</h3>
                <p className="text-caption text-fg-3">{t.data.depthsNote}</p>
              </div>
              <ul className="flex flex-col divide-y divide-line rounded-panel border border-line-2 bg-elev-1">
                {UI_ASSETS.map((a) => {
                  const parts = symbolParts(a);
                  const note = depthNote(a, locale);
                  const rec = RECOVERY_BPS[a.id];
                  const why = recoveryWhy(a.id, locale);
                  return (
                    <li key={a.id} className="grid gap-3 p-4 sm:p-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-body-sm font-medium text-fg-1">{parts.base}</span>
                        <span className="label-mono text-fg-3">{t.data.chain[parts.chain]}</span>
                        <span className="font-mono text-caption text-fg-2">
                          {t.data.columns.debt} {fmt.usd(a.debtUsd)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-body-sm text-fg-1">{fmt.usd(a.depthUsd)}</span>
                          <HonestyTag kind={a.depthIsAssumption ? "assumption" : "measured"}>
                            {a.depthIsAssumption ? c.honesty.assumption : c.honesty.measured}
                          </HonestyTag>
                        </span>
                        {(() => {
                          const { summary, rest } = splitNote(note.text);
                          return (
                            <div lang={note.lang} className="flex flex-col gap-1 text-caption break-words text-fg-3">
                              <span>{summary}</span>
                              {rest && (
                                <details className="group">
                                  <summary className="w-fit cursor-pointer list-none text-fg-2 underline decoration-line-strong decoration-dotted underline-offset-4 hover:text-fg-1 [&::-webkit-details-marker]:hidden">
                                    <span lang={locale}>{t.data.fullNote}</span>
                                  </summary>
                                  <p className="mt-1.5">{rest}</p>
                                </details>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label-mono text-fg-3">{t.data.columns.recovery}</span>
                        {rec ? (
                          <>
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-body-sm text-fg-1">{fmt.pct(rec.bps / 10_000, 0)}</span>
                              <HonestyTag kind="assumption">{c.honesty.assumption}</HonestyTag>
                            </span>
                            {why && (
                              <span lang={why.lang} className="text-caption text-fg-3">
                                {why.text}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-caption text-fg-3">{t.data.noRecovery}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className={prose}>{t.data.ethereum}</p>
            <p className={prose}>
              {t.data.calibrated({ n: fmt.int(syrup.calibratedPositions), asset: symbolParts(syrup).base })}{" "}
              <HonestyTag kind="synthetic">{c.honesty.synthetic}</HonestyTag>
            </p>
          </Section>

          <Section id="assumptions" index={4} kicker={t.toc.assumptions} title={t.assumptions.title}>
            <ol className="flex max-w-doc flex-col gap-3">
              {t.assumptions
                .items({ steps: fmt.int(BASE_SETTINGS.steps), block: fmt.block(DEPLOYMENT.source.block), maturity })
                .map((item, i) => (
                  <li key={item} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 text-body text-fg-2">
                    <span className="pt-1 font-mono text-caption text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                    <span>{item}</span>
                  </li>
                ))}
            </ol>
          </Section>

          <Section id="monad" index={5} kicker={t.toc.monad} title={t.monad.title}>
            <p className={prose}>{t.monad.intro}</p>
            <ul className="grid max-w-doc gap-3">
              <li>
                <Panel className="p-5 text-body-sm text-fg-2">
                  {t.monad.gas({ monad: fmt.int(MONAD_TX_GAS_LIMIT), eth: fmt.int(ETH_TX_GAS_CAP) })}
                </Panel>
              </li>
              <li>
                <Panel className="p-5 text-body-sm text-fg-2">
                  {t.monad.reads({ monad: fmt.num(MONAD_READ_GAS_PER_POSITION, 1), eth: fmt.int(ETH_READ_GAS_PER_POSITION), slots: fmt.int(MONAD_PAGE_SLOTS) })}
                </Panel>
              </li>
              <li>
                <Panel tone={scaleSim ? "monad" : undefined} className="flex flex-col gap-3 p-5 text-body-sm text-fg-2">
                  {scaleSim ? (
                    (() => {
                      const gas = Number(scaleSim.gasUsed);
                      const eth = ethEstimate({ positionsUsed: Number(scaleSim.positionsUsed), memoryBytes: scaleSim.memoryBytes, gasUsed: scaleSim.gasUsed });
                      return (
                        <>
                          <span className="flex flex-wrap gap-2">
                            <HonestyTag kind="synthetic">{c.honesty.synthetic}</HonestyTag>
                            <HonestyTag kind="estimate">{c.honesty.estimate}</HonestyTag>
                          </span>
                          <span>
                            {t.monad.proof({
                              n: fmt.int(scaleSim.positionsUsed),
                              gas: fmt.int(gas),
                              share: fmt.pct(gas / MONAD_TX_GAS_LIMIT, 0),
                              eth: fmt.int(Math.round(eth)),
                              ratio: fmt.ratio(eth / ETH_TX_GAS_CAP),
                            })}
                          </span>
                          <span className="text-caption text-fg-3">{t.monad.estimateNote({ cold: fmt.int(ETH_COLD_SLOAD) })}</span>
                        </>
                      );
                    })()
                  ) : (
                    <span>{t.monad.proofMissing}</span>
                  )}
                </Panel>
              </li>
            </ul>
            <p className={prose}>{t.monad.sync}</p>
          </Section>

          <Section id="proofs" index={6} kicker={t.toc.proofs} title={t.proofs.title}>
            <p className={prose}>{t.proofs.intro}</p>
            <ProofLedger proofs={proofs} t={t.proofs} locale={locale} />
          </Section>

          <Section id="verify" index={7} kicker={t.toc.verify} title={t.verify.title}>
            <ol className="flex max-w-doc flex-col gap-4">
              {t.verify.steps.map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
                  <span className="pt-0.5 font-mono text-caption text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-body font-medium text-fg-1">{title}</h3>
                    <p className="text-body-sm text-fg-2">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <ButtonLink href={href("app", locale)} variant="primary">
                {t.verify.console}
                <ButtonArrow />
              </ButtonLink>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-title-3 text-fg-1">{t.verify.contracts}</h3>
              <ul className="flex flex-col divide-y divide-line rounded-panel border border-line-2 bg-elev-1">
                {(Object.keys(t.verify.roles) as (keyof typeof t.verify.roles)[]).map((key) => {
                  const address = DEPLOYMENT.contracts[key];
                  if (!address) return null;
                  return (
                    <li key={key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3.5">
                      <span className="flex flex-col">
                        <span className="text-body-sm text-fg-1">{c.footer.contractNames[key]}</span>
                        <span className="text-caption text-fg-3">{t.verify.roles[key]}</span>
                      </span>
                      <a
                        href={addrUrl(address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-1.5 font-mono text-caption text-fg-2 hover:text-fg-1"
                        aria-label={`${c.footer.contractNames[key]}: ${address}`}
                      >
                        {shortAddr(address)}
                        <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Section>

          <Section id="security" index={8} kicker={t.toc.security} title={t.security.title}>
            <ul className="flex max-w-doc flex-col gap-3">
              {t.security.items.map((item) => (
                <li key={item} className="flex gap-3 text-body text-fg-2">
                  <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-fg-3" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex w-fit items-center gap-1.5 text-body-sm text-fg-2 hover:text-fg-1"
            >
              {t.security.source}
              <ArrowUpRight className="size-4 text-fg-3 group-hover:text-fg-1" aria-hidden />
              <span className="sr-only">({c.footer.externalHint})</span>
            </a>
          </Section>
        </div>
      </div>
    </div>
  );
}
