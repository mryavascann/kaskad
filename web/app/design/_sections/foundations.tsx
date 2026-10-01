import {
  ArrowUpRight,
  Blocks,
  Command,
  Copy,
  Gauge,
  Lock,
  LockOpen,
  Search,
  Volume2,
  VolumeX,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { contrastRatio } from "@/design/color";
import {
  color,
  colorGroups,
  colorRole,
  cssVar,
  hex,
  layout,
  radius,
  type as typeScale,
  type ColorToken,
  type TypeName,
} from "@/design/tokens";
import { Label } from "@/design/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/design/ui/panel";
import { TONES, toneIcon, toneText, type Tone } from "@/design/ui/tone";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { cn } from "@/lib/utils";
import { DocBlock, DocSection, SpecGrid, Specimen } from "../_components/doc";

// Sample numbers on this page come from the deployment snapshot (lib/kaskad/deployment.json), never invented.
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const usdFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-US");

function Accent({ children }: { children: ReactNode }) {
  return <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">{children}</em>;
}

function Contrast({ fg, bg }: { fg: ColorToken; bg: ColorToken }) {
  const ratio = contrastRatio(color[fg], color[bg]);
  const grade = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "Large" : "Decor";
  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono text-caption text-fg-2">
      {ratio.toFixed(1)}:1
      <span className={cn("label-mono", ratio >= 4.5 ? "text-safe" : "text-warn")}>{grade}</span>
      <span className="sr-only">on {bg}</span>
    </span>
  );
}

function TokenMeta({ token, children }: { token: ColorToken; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <code className="font-mono text-caption text-fg-1">--color-{token}</code>
      <code className="font-mono text-caption break-all text-fg-3">{color[token]}</code>
      {!color[token].includes("/") && <code className="font-mono text-caption text-fg-3">{hex[token]}</code>}
      <p className="text-caption text-fg-2">{colorRole[token]}</p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */

const statusTones: { tone: Exclude<Tone, "neutral">; base: ColorToken; hi: ColorToken; meaning: string }[] = [
  { tone: "calm", base: "calm", hi: "calm-hi", meaning: "Nothing moving: safe positions in a scene, idle axes, the needle at rest." },
  { tone: "warn", base: "warn", hi: "warn-hi", meaning: "Below the liquidation threshold, or debt the pool cannot clear instantly." },
  { tone: "liq", base: "liq", hi: "liq-hi", meaning: "Liquidation, bad debt, alarms and reverted transactions." },
  { tone: "safe", base: "safe", hi: "safe-hi", meaning: "Healthy, protected, confirmed on-chain." },
  { tone: "monad", base: "monad", hi: "monad-hi", meaning: "Monad accent and the focus ring. Used sparingly." },
];

export function ColorSection() {
  return (
    <DocSection
      id="color"
      index="01"
      kicker="Foundations"
      title={<>Calm until it <Accent>isn&apos;t.</Accent></>}
      description="A very dark violet-navy instrument. Status colors carry meaning and never travel alone: every tone ships with an icon or a word. All values are OKLCH; hex is only a fallback for renderers such as three.js."
    >
      <DocBlock title="Surfaces" note="Never pure black. One step per elevation.">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {colorGroups.surface.map((token) => (
            <div key={token} className="flex flex-col bg-elev-1">
              <div className="h-24 border-b border-line" style={{ background: cssVar(token) }} />
              <div className="p-4">
                <TokenMeta token={token} />
              </div>
            </div>
          ))}
        </div>
      </DocBlock>

      <DocBlock title="Text" note="Ratios on bg and on elev-3, the lightest surface.">
        <SpecGrid cols={4}>
          {colorGroups.text.map((token) => (
            <Panel key={token} className="flex flex-col gap-4 p-5">
              <p className="text-title-2" style={{ color: cssVar(token) }}>
                Aa <span className="font-mono">0123</span>
              </p>
              <TokenMeta token={token}>
                <div className="mt-1 flex flex-col gap-1">
                  <Contrast fg={token} bg="bg" />
                  <Contrast fg={token} bg="elev-3" />
                </div>
              </TokenMeta>
            </Panel>
          ))}
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Lines" note="1px only. line-strong gives input borders 3:1 non-text contrast.">
        <Panel className="divide-y divide-line">
          {colorGroups.line.map((token) => (
            <div key={token} className="grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[14rem_1fr]">
              <div className="flex flex-col gap-0.5">
                <code className="font-mono text-caption text-fg-1">--color-{token}</code>
                <span className="text-caption text-fg-3">{colorRole[token]}</span>
              </div>
              <div className="h-px w-full" style={{ background: cssVar(token) }} />
            </div>
          ))}
        </Panel>
      </DocBlock>

      <DocBlock title="Status" note="Solid for marks and big numbers, -hi for small text on tinted fills.">
        <SpecGrid cols={3}>
          {statusTones.map(({ tone, base, hi, meaning }) => {
            const Icon = toneIcon[tone];
            return (
              <Panel key={tone} className="overflow-hidden">
                <div className="flex h-24 items-end justify-between p-4" style={{ background: cssVar(base) }}>
                  <Icon className="size-6 text-bg" aria-hidden />
                  <span className="label-mono text-bg">{tone}</span>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <p className="text-body-sm text-fg-2">{meaning}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <code className="font-mono text-caption text-fg-1">{base}</code>
                      <code className="font-mono text-caption text-fg-3">{hex[base]}</code>
                      <Contrast fg={base} bg="bg" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <code className="font-mono text-caption" style={{ color: cssVar(hi) }}>{hi}</code>
                      <code className="font-mono text-caption text-fg-3">{hex[hi]}</code>
                      <Contrast fg={hi} bg="elev-3" />
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Severity ramp" note="For data marks, calm to liquidation. Green is skipped on purpose: green means safe.">
        <Panel className="p-5">
          <div className="grid grid-cols-5 gap-1">
            {colorGroups.severity.map((token) => (
              <div key={token} className="flex flex-col gap-2">
                <div className="h-10 rounded-tag" style={{ background: cssVar(token) }} />
                <code className="font-mono text-caption text-fg-1">{token}</code>
                <span className="hidden text-caption text-fg-3 sm:block">{colorRole[token].replace(/^Severity \d: /, "")}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1" aria-hidden>
            {Array.from({ length: 24 }, (_, i) => {
              const level = Math.min(4, Math.floor(i / 5));
              return (
                <span
                  key={i}
                  className="aspect-square rounded-[3px] border"
                  style={{ background: `color-mix(in oklab, ${cssVar(colorGroups.severity[level])} 28%, transparent)`, borderColor: cssVar(colorGroups.severity[level]) }}
                />
              );
            })}
          </div>
        </Panel>
      </DocBlock>
    </DocSection>
  );
}

/* ------------------------------------------------------------------------------------------ */

const typeSample: Record<TypeName, { className: string; sample: ReactNode; note?: string }> = {
  "display-xl": { className: "text-display-xl", sample: "One transaction." },
  display: { className: "text-display", sample: <>Every <Accent>liquidation</Accent> wave.</> },
  "title-1": { className: "text-title-1", sample: "Is my position safe?" },
  "title-2": { className: "text-title-2", sample: "Stress curve" },
  "title-3": { className: "text-title-3", sample: "Guard · circuit breaker" },
  lead: { className: "text-lead", sample: "Kaskad replays a depeg across the real Aave book on Monad, inside a single transaction anyone can verify." },
  body: { className: "text-body", sample: "Collateral is sold, the price drops, new positions cross the threshold: the next wave." },
  "body-sm": { className: "text-body-sm", sample: "Free preview through eth_call. Nothing is written on-chain." },
  caption: { className: "text-caption", sample: "Model: single Monad DEX pool, instant-sale (flash-loan) liquidator. Maple redemption and other venues excluded." },
  label: { className: "label-mono", sample: "Liquidation cascade engine · on-chain" },
  "metric-xl": { className: "font-mono text-metric-xl", sample: usdCompact.format(DEPLOYMENT.totals.debtUsd), note: "Total debt, snapshot" },
  "metric-lg": { className: "font-mono text-metric-lg", sample: usdCompact.format(DEPLOYMENT.totals.suppliedUsd), note: "Total supplied, snapshot" },
  "metric-md": { className: "font-mono text-metric-md", sample: integer.format(DEPLOYMENT.totals.positions), note: "Borrowers with debt" },
  "metric-sm": { className: "font-mono text-metric-sm", sample: `#${integer.format(DEPLOYMENT.source.block)}`, note: "Source block" },
};

const families: { name: string; className: string; sample: ReactNode; use: string }[] = [
  { name: "Geist", className: "font-sans font-medium tracking-[-0.04em]", sample: "Aa", use: "Headlines and UI copy. 500 for headlines with tight tracking, 400 for text." },
  { name: "Geist Mono", className: "font-mono tracking-[-0.03em]", sample: "0.1", use: "Every number and label. Tabular figures everywhere, uppercase tracked labels." },
  { name: "Instrument Serif", className: "font-serif italic", sample: "Aa", use: "Accent only: one or two italic words in a headline. Never for body copy." },
];

export function TypeSection() {
  const ledger: [string, number][] = [
    ["Supplied", DEPLOYMENT.totals.suppliedUsd],
    ["Borrower collateral", DEPLOYMENT.totals.borrowerCollateralUsd],
    ["Debt", DEPLOYMENT.totals.debtUsd],
  ];
  return (
    <DocSection
      id="type"
      index="02"
      kicker="Foundations"
      title={<>Numbers <Accent>first.</Accent></>}
      description="Big numbers, few words. Geist carries the voice, Geist Mono carries every figure, Instrument Serif appears once per headline at most."
    >
      <DocBlock title="Families">
        <SpecGrid cols={3}>
          {families.map((f) => (
            <Panel key={f.name} className="flex flex-col gap-6 p-5">
              <p className={cn("text-[5.5rem] leading-none text-fg-1", f.className)}>{f.sample}</p>
              <div className="flex flex-col gap-1.5">
                <Label>{f.name}</Label>
                <p className="text-body-sm text-fg-2">{f.use}</p>
              </div>
            </Panel>
          ))}
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Scale" note="Fluid sizes clamp between phone and desktop.">
        <Panel className="divide-y divide-line">
          {(Object.keys(typeScale) as TypeName[]).map((name) => {
            const t = typeScale[name];
            const { className, sample, note } = typeSample[name];
            return (
              <div key={name} className="grid grid-cols-1 gap-4 px-5 py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
                <div className="flex flex-col gap-1">
                  <code className="font-mono text-caption text-fg-1">text-{name}</code>
                  <span className="text-caption text-fg-2">{t.role}</span>
                  <code className="font-mono text-caption break-all text-fg-3">{t.size}</code>
                  <code className="font-mono text-caption text-fg-3">
                    lh {t.lineHeight}
                    {"letterSpacing" in t && ` · ${t.letterSpacing}`}
                    {"fontWeight" in t && ` · ${t.fontWeight}`}
                  </code>
                  {note && <span className="label-mono mt-1 text-fg-3">{note}</span>}
                </div>
                <div className={cn("min-w-0 text-fg-1", className)}>{sample}</div>
              </div>
            );
          })}
        </Panel>
      </DocBlock>

      <DocBlock title="Tabular figures" note="Digits share one width, so columns of numbers line up.">
        <Panel className="p-5">
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2">
            {ledger.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="label-mono self-center text-fg-3">{label}</dt>
                <dd className="text-right font-mono text-metric-sm text-fg-1">{usdFull.format(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-caption text-fg-3">Monad Aave snapshot, block #{integer.format(DEPLOYMENT.source.block)}.</p>
        </Panel>
      </DocBlock>

      <DocBlock title="Rules">
        <ul className="grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 md:grid-cols-2">
          {[
            "Headlines: Geist 500, negative tracking, balanced wrapping.",
            "Every number: Geist Mono with tabular figures, with its unit (currency sign, %, M) in the same run.",
            "Labels: mono, uppercase, 0.16em tracking, never below 11px.",
            "Serif italic: one or two words per headline, never inside data.",
            "Body copy: 16px / 1.6, max ~70 characters per line.",
            "Inter is not used anywhere.",
          ].map((rule) => (
            <li key={rule} className="bg-elev-1 px-5 py-4 text-body-sm text-fg-2">{rule}</li>
          ))}
        </ul>
      </DocBlock>
    </DocSection>
  );
}

/* ------------------------------------------------------------------------------------------ */

const spanClass: Record<number, string> = {
  12: "lg:col-span-12",
  8: "lg:col-span-8",
  6: "lg:col-span-6",
  4: "lg:col-span-4",
  3: "lg:col-span-3",
};

export function LayoutSection() {
  const bp = layout.breakpoints;
  const rows = [
    { range: `0–${bp.sm - 1}`, cols: layout.columns.base, gutter: layout.gutter.base, gap: layout.gap.base },
    { range: `${bp.sm}–${bp.md - 1}`, cols: layout.columns.base, gutter: layout.gutter.sm, gap: layout.gap.base },
    { range: `${bp.md}–${bp.lg - 1}`, cols: layout.columns.md, gutter: layout.gutter.sm, gap: layout.gap.base },
    { range: `${bp.lg}–${layout.containerPage - 1}`, cols: layout.columns.lg, gutter: layout.gutter.lg, gap: layout.gap.lg },
    { range: `≥ ${layout.containerPage}`, cols: layout.columns.lg, gutter: layout.gutter.page, gap: layout.gap.lg },
  ];
  const spacing = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];
  return (
    <DocSection
      id="layout"
      index="03"
      kicker="Foundations"
      title="Twelve columns, one hero."
      description="A 12-column grid on desktop, 8 on tablets, 4 on phones, inside a 1440px container. Generous space, one hero metric per screen. Press G to overlay the grid on this page."
    >
      <DocBlock title="Columns" note="page-shell + grid-page">
        <div className="grid-page">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "flex h-24 items-end justify-center rounded-tag border border-monad/30 bg-monad/8 pb-2",
                i >= 4 && "hidden md:flex",
                i >= 8 && "md:hidden lg:flex",
              )}
            >
              <span className="font-mono text-caption text-fg-2">{i + 1}</span>
            </div>
          ))}
        </div>
      </DocBlock>

      <DocBlock title="Spans" note="Full width on phones; spans apply from 1024px.">
        <div className="flex flex-col gap-2">
          {[[12], [8, 4], [6, 6], [4, 4, 4], [3, 3, 3, 3]].map((row) => (
            <div key={row.join("-")} className="grid-page gap-y-2">
              {row.map((span, i) => (
                <div key={i} className={cn("col-span-full flex h-11 items-center rounded-tag border border-line-2 bg-elev-1 px-3", spanClass[span])}>
                  <code className="font-mono text-caption text-fg-2">col-span-{span}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DocBlock>

      <DocBlock title="Breakpoints" note="px">
        <Panel className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line">
                {["Viewport", "Columns", "Gutter", "Gap"].map((h) => (
                  <th key={h} scope="col" className="label-mono px-3 py-3 font-normal text-fg-3 sm:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-body-sm text-fg-1">
              {rows.map((r) => (
                <tr key={r.range}>
                  <td className="px-3 py-3 sm:px-5">{r.range}</td>
                  <td className="px-3 py-3 sm:px-5">{r.cols}</td>
                  <td className="px-3 py-3 sm:px-5">{r.gutter}</td>
                  <td className="px-3 py-3 sm:px-5">{r.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </DocBlock>

      <DocBlock title="Containers and spacing" note="4px base unit">
        <SpecGrid cols={2}>
          <Specimen label="Containers" meta="max-w-page · max-w-doc" bodyClassName="flex-col items-stretch justify-center gap-3">
            {[
              ["page", layout.containerPage, "Pages, console"],
              ["doc", layout.containerDoc, "How it works (reading width)"],
            ].map(([name, px, use]) => (
              <div key={name as string} className="flex flex-col gap-1.5">
                <div className="h-2 rounded-full bg-fg-3/40" style={{ width: `${((px as number) / layout.containerPage) * 100}%` }} />
                <span className="font-mono text-caption text-fg-2">
                  {name} · {px}px · <span className="text-fg-3">{use}</span>
                </span>
              </div>
            ))}
          </Specimen>
          <Specimen label="Spacing scale" meta="p-1 … p-24" bodyClassName="flex-col items-start gap-1.5">
            {spacing.map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="w-8 text-right font-mono text-caption text-fg-3">{n}</span>
                <span className="h-2 rounded-[2px] bg-calm/70" style={{ width: n * 4 }} />
                <span className="font-mono text-caption text-fg-2">{n * 4}px</span>
              </div>
            ))}
          </Specimen>
        </SpecGrid>
      </DocBlock>
    </DocSection>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function SurfaceSection() {
  const glows: [string, string][] = [
    ["shadow-pop", "Floating layers"],
    ["shadow-glow-liq", "Liquidation alarm"],
    ["shadow-glow-warn", "Below threshold"],
    ["shadow-glow-safe", "Protected"],
    ["shadow-glow-monad", "On-chain proof"],
  ];
  const radiusClass: Record<keyof typeof radius, string> = {
    tag: "rounded-tag",
    control: "rounded-control",
    panel: "rounded-panel",
    sheet: "rounded-sheet",
  };
  return (
    <DocSection
      id="surfaces"
      index="04"
      kicker="Foundations"
      title={<>Lines, not <Accent>shadows.</Accent></>}
      description="Depth comes from 1px lines and small steps in lightness. Shadows are reserved for floating layers; glows only for alarm and proof states."
    >
      <DocBlock title="Elevation">
        <div className="rounded-sheet border border-line bg-bg p-4 sm:p-6">
          <Label>bg</Label>
          <div className="mt-3 rounded-panel border border-line-2 bg-elev-1 p-4 sm:p-6">
            <Label>elev-1 · panels</Label>
            <div className="mt-3 rounded-panel border border-line-2 bg-elev-2 p-4 sm:p-6">
              <Label>elev-2 · inputs, popovers</Label>
              <div className="mt-3 rounded-control border border-line-3 bg-elev-3 p-4 sm:p-5">
                <Label>elev-3 · tooltips, active</Label>
              </div>
            </div>
          </div>
        </div>
      </DocBlock>

      <DocBlock title="Panel" note="<Panel variant tone corners interactive>">
        <SpecGrid cols={3}>
          <Specimen label="solid" meta='variant="solid"' bodyClassName="block p-4">
            <Panel>
              <PanelHeader title="Scenario" />
              <PanelBody className="text-body-sm text-fg-2">Grouped content on elev-1.</PanelBody>
            </Panel>
          </Specimen>
          <Specimen label="glass" meta='variant="glass"' bodyClassName="block bg-grid p-4 [--grid-cell:24px]">
            <Panel variant="glass">
              <PanelBody className="text-body-sm text-fg-2">Readouts floating over a scene.</PanelBody>
            </Panel>
          </Specimen>
          <Specimen label="inset" meta='variant="inset"' bodyClassName="block p-4">
            <Panel variant="inset">
              <PanelBody className="text-body-sm text-fg-2">Wells inside a panel.</PanelBody>
            </Panel>
          </Specimen>
          <Specimen label="corners + interactive" meta="corners interactive" bodyClassName="block p-4">
            <Panel corners interactive>
              <PanelBody className="text-body-sm text-fg-2">Instrument corner ticks. Hover me.</PanelBody>
            </Panel>
          </Specimen>
          <Specimen label="tone warn" meta='tone="warn"' bodyClassName="block p-4">
            <Panel tone="warn">
              <PanelBody className="text-body-sm text-warn">Below threshold: pair the tint with words.</PanelBody>
            </Panel>
          </Specimen>
          <Specimen label="tone liq" meta='tone="liq"' bodyClassName="block p-4">
            <Panel tone="liq">
              <PanelBody className="text-body-sm text-liq-hi">Liquidation state.</PanelBody>
            </Panel>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Radius" note="px">
        <SpecGrid cols={4}>
          {(Object.keys(radius) as (keyof typeof radius)[]).map((name) => (
            <Specimen key={name} label={name} meta={`rounded-${name} · ${radius[name]}px`}>
              <div className={cn("size-16 border border-line-strong bg-elev-2", radiusClass[name])} />
            </Specimen>
          ))}
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Shadows and glows">
        <SpecGrid cols={3}>
          {glows.map(([name, use]) => (
            <Specimen key={name} label={name} meta={use}>
              <div className={cn("h-16 w-full rounded-panel border border-line-2 bg-elev-2", name)} />
            </Specimen>
          ))}
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Instrument textures">
        <SpecGrid cols={2}>
          <Specimen label="bg-grid" meta="--grid-cell (default 120px)" bodyClassName="p-0">
            <div className="h-40 w-full bg-grid [--grid-cell:32px] [mask-image:linear-gradient(#000_40%,transparent)]" />
          </Specimen>
          <Specimen label="corner-ticks" meta="--tick · --tick-len">
            <div className="corner-ticks h-32 w-full rounded-[2px]" />
          </Specimen>
        </SpecGrid>
      </DocBlock>
    </DocSection>
  );
}

/* ------------------------------------------------------------------------------------------ */

const toneMeaning: Record<Tone, string> = {
  neutral: "Information, help",
  calm: "At rest, idle",
  warn: "Below threshold",
  liq: "Liquidation, alarm",
  safe: "Protected, confirmed",
  monad: "On-chain object",
};

const productIcons: [LucideIcon, string][] = [
  [Waves, "Cascade, waves"],
  [Gauge, "Health factor"],
  [Zap, "Transaction"],
  [Blocks, "On-chain proof"],
  [Lock, "Borrows paused"],
  [LockOpen, "Borrows open"],
  [Search, "Address lookup"],
  [Copy, "Copy address"],
  [ArrowUpRight, "External link"],
  [Command, "Command menu"],
  [Volume2, "Sound on"],
  [VolumeX, "Sound off"],
];

export function IconSection() {
  return (
    <DocSection
      id="icons"
      index="05"
      kicker="Foundations"
      title="Thin strokes, clear meaning."
      description="Lucide at a 1.5px stroke, 16px in text and controls, 20–24px in empty states. Icons are decorative (aria-hidden) unless they are the only content of a control, which then gets a name."
    >
      <DocBlock title="Tone icons" note="toneIcon in design/ui/tone.ts">
        <SpecGrid cols={3}>
          {TONES.map((tone) => {
            const Icon = toneIcon[tone];
            return (
              <Specimen key={tone} label={tone} meta={toneMeaning[tone]}>
                <Icon className={cn("size-6", toneText[tone])} aria-hidden />
                <span className={cn("text-body-sm", toneText[tone])}>{Icon.displayName ?? tone}</span>
              </Specimen>
            );
          })}
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Product icons" note="16 · 20 · 24">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-3 lg:grid-cols-4">
          {productIcons.map(([Icon, use]) => (
            <div key={use} className="flex items-center justify-between gap-3 bg-elev-1 px-4 py-4">
              <span className="text-body-sm text-fg-2">{use}</span>
              <span className="flex items-end gap-2 text-fg-1">
                <Icon className="size-4" aria-hidden />
                <Icon className="size-5" aria-hidden />
                <Icon className="size-6" aria-hidden />
              </span>
            </div>
          ))}
        </div>
      </DocBlock>
    </DocSection>
  );
}
