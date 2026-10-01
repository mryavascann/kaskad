import { BookOpen, FlaskConical, RotateCcw, SearchX, Waves } from "lucide-react";
import { Badge } from "@/design/ui/badge";
import { Button, ButtonArrow } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Divider } from "@/design/ui/divider";
import { EmptyState } from "@/design/ui/empty-state";
import { Footnote } from "@/design/ui/footnote";
import { HONESTY, HONESTY_KINDS, HonestyTag } from "@/design/ui/honesty";
import { Kbd, KbdGroup } from "@/design/ui/kbd";
import { Eyebrow, Label } from "@/design/ui/label";
import { Logo, LogoMark } from "@/design/ui/logo";
import { Metric, MetricValue, formatMetric, type MetricFormat } from "@/design/ui/metric";
import { Panel, PanelHeader } from "@/design/ui/panel";
import { Readout, ReadoutRow } from "@/design/ui/readout";
import { SectionHeader } from "@/design/ui/section-header";
import { Skeleton, SkeletonMetric, SkeletonText } from "@/design/ui/skeleton";
import { LiveIndicator, StatusDot } from "@/design/ui/status-dot";
import { Steps, type Step } from "@/design/ui/steps";
import { TickRuler } from "@/design/ui/tick-ruler";
import { TONES, type Tone } from "@/design/ui/tone";
import { DEPLOYMENT, UI_ASSETS, addrUrl } from "@/lib/kaskad/config";
import { DocBlock, DocSection, SpecGrid, Specimen } from "../_components/doc";
import { MetricCycleDemo, StepsReplayDemo, ToastDemo, type DemoAsset } from "./display-demos";

// Owned by the display agent. Every number below comes from DEPLOYMENT (the committed snapshot) or is
// an obviously generic placeholder (123,456,789).

const usdCompact: MetricFormat = {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};
const usd = (n: number) => formatMetric(n, usdCompact);
const int = (n: number) => formatMetric(n, { maximumFractionDigits: 0 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const { totals, source } = DEPLOYMENT;
const kaskad = DEPLOYMENT.contracts.kaskad;

/** A sample word per tone: what the tone means in Kaskad. */
const toneWord: Record<Tone, string> = {
  neutral: "Testnet",
  calm: "Calm",
  warn: "Below threshold",
  liq: "Liquidation",
  safe: "Protected",
  monad: "Monad",
};

const alarmWord: Record<Tone, string> = {
  neutral: "Beta",
  calm: "Idle",
  warn: "Stuck debt",
  liq: "Borrows paused",
  safe: "Guard active",
  monad: "On-chain",
};

// Measured vs assumed exit depth, straight from the snapshot.
const measuredDepth = Object.values(DEPLOYMENT.assets).find((a) => a.inUi && !a.depthIsAssumption);
const assumedDepth = Object.values(DEPLOYMENT.assets).find((a) => a.inUi && a.depthIsAssumption);

const MODEL_NOTE = "Single Monad DEX pool, instant-sale (flash-loan) liquidator; Maple redemption and other venues excluded.";

export function DisplaySection() {
  return (
    <DocSection
      id="display"
      index="07"
      kicker="Components"
      title="Display"
      description="Tags, status marks, honesty labels, keys, rules, the mark and section headers. Every tone ships with an icon or a word."
    >
      <DocBlock title="Badge" note="soft · outline · solid. The tone icon comes by default; the word carries the meaning.">
        <SpecGrid cols={3}>
          <Specimen label="Soft" meta={`<Badge tone="warn">`}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {toneWord[tone]}
              </Badge>
            ))}
          </Specimen>
          <Specimen label="Outline" meta={`variant="outline"`}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} variant="outline">
                {toneWord[tone]}
              </Badge>
            ))}
          </Specimen>
          <Specimen label="Solid · alarms only" meta={`variant="solid" mono`}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} variant="solid" mono>
                {alarmWord[tone]}
              </Badge>
            ))}
          </Specimen>
        </SpecGrid>
        <SpecGrid cols={2}>
          <Specimen label="Sizes · mono" meta={`size="sm" | "md"  mono`}>
            <Badge size="sm" tone="liq" mono>
              Bad debt
            </Badge>
            <Badge size="md" tone="liq" mono>
              Bad debt
            </Badge>
            <Badge size="sm" tone="calm">
              Realistic oracle
            </Badge>
            <Badge size="md" tone="calm">
              Realistic oracle
            </Badge>
            <Badge size="sm" variant="outline" mono icon={null}>
              ID 9
            </Badge>
          </Specimen>
          <Specimen label="In context" meta={`icon={null} when the text states it`} bodyClassName="flex-col items-stretch gap-3">
            <div className="flex items-center justify-between gap-3 rounded-control border border-line-2 bg-bg px-4 py-3">
              <span className="text-body-sm text-fg-1">Market A</span>
              <Badge variant="outline" mono size="sm" icon={null}>
                Unprotected
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-control border border-liq/45 bg-liq/8 px-4 py-3">
              <span className="text-body-sm text-fg-1">Market B</span>
              <Badge variant="solid" tone="liq" mono size="sm">
                Borrows paused
              </Badge>
            </div>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Status" note="Dots are decorative unless labelled; the word next to them states the status.">
        <SpecGrid cols={3}>
          <Specimen label="StatusDot · tones" meta={`<StatusDot tone="safe" />`} bodyClassName="grid grid-cols-2 gap-x-6 gap-y-3">
            {TONES.map((tone) => (
              <span key={tone} className="flex items-center gap-2.5">
                <StatusDot tone={tone} />
                <Label>{tone}</Label>
              </span>
            ))}
          </Specimen>
          <Specimen label="pulse · ping · sizes" meta="pulse ping size label" bodyClassName="flex-col items-start gap-4">
            <span className="flex items-center gap-2.5">
              <StatusDot tone="safe" pulse />
              <Label>pulse · live data</Label>
            </span>
            <span className="flex items-center gap-2.5">
              <StatusDot tone="liq" ping />
              <Label>ping · an event just happened</Label>
            </span>
            <span className="flex items-center gap-2.5">
              <StatusDot tone="warn" size="sm" label="Warning" />
              <StatusDot tone="warn" size="md" label="Warning" />
              <StatusDot tone="warn" size="lg" label="Warning" />
              <Label>sm · md · lg (labelled)</Label>
            </span>
          </Specimen>
          <Specimen label="LiveIndicator" meta="label value tone" bodyClassName="flex-col items-start gap-3.5">
            <LiveIndicator label="Monad testnet" value={DEPLOYMENT.deployBlock} />
            <LiveIndicator label="Mainnet" valueLabel="Source block" tone="calm" pulse={false} value={source.block} />
            <LiveIndicator label="Connecting" tone="warn" value={null} />
            <LiveIndicator label="RPC unreachable" tone="liq" pulse={false} />
          </Specimen>
        </SpecGrid>
        <p className="text-caption text-fg-3">
          Block numbers above are the snapshot&apos;s deploy block ({int(DEPLOYMENT.deployBlock)}) and source block ({int(source.block)}), not
          live reads.
        </p>
      </DocBlock>

      <DocBlock title="Honesty tags" note="Solid outline: read or measured. Dashed: assumed, estimated or synthetic.">
        <SpecGrid cols={2}>
          <Specimen label="Kinds" meta={`<HonestyTag kind="assumption" />`} bodyClassName="grid gap-3 sm:grid-cols-2">
            {HONESTY_KINDS.map((kind) => (
              <span key={kind} className="flex min-w-0 flex-col items-start gap-1.5">
                <HonestyTag kind={kind} />
                <span className="text-caption text-fg-3">{HONESTY[kind].meaning}</span>
              </span>
            ))}
          </Specimen>
          <Specimen label="Next to the number" meta="children override the label" bodyClassName="flex-col items-stretch gap-0 p-0">
            <Readout>
              <ReadoutRow
                label="Debt, all borrowers"
                value={
                  <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                    {usd(totals.debtUsd)}
                    <HonestyTag kind="real">Real book · Monad Aave · {int(source.borrowersWithDebt)} borrowers</HonestyTag>
                  </span>
                }
              />
              {measuredDepth && (
                <ReadoutRow
                  label={`${measuredDepth.symbol} exit depth`}
                  value={
                    <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                      {usd(measuredDepth.depthUsd)}
                      <HonestyTag kind="measured" />
                    </span>
                  }
                />
              )}
              {assumedDepth && (
                <ReadoutRow
                  label={`${assumedDepth.symbol} exit depth`}
                  value={
                    <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                      {usd(assumedDepth.depthUsd)}
                      <HonestyTag kind="assumption" />
                    </span>
                  }
                />
              )}
              <ReadoutRow label="Scale test" value={<HonestyTag kind="synthetic" />} />
            </Readout>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Label and eyebrow" note="From ui/label: mono uppercase, fg-3 by default.">
        <SpecGrid cols={2}>
          <Specimen label="Label · tones" meta={`<Label tone="liq">`}>
            <Label>Pool can clear</Label>
            {TONES.filter((t) => t !== "neutral").map((tone) => (
              <Label key={tone} tone={tone}>
                {tone}
              </Label>
            ))}
          </Specimen>
          <Specimen label="Eyebrow" meta={`<Eyebrow index="01" leading={…}>`} bodyClassName="flex-col items-start gap-4">
            <Eyebrow index="01">Liquidation cascade engine</Eyebrow>
            <Eyebrow leading={<StatusDot tone="safe" pulse />}>On-chain · Monad testnet</Eyebrow>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Keys" note="Symbol keys get a spoken name.">
        <SpecGrid cols={3}>
          <Specimen label="Combination" meta={`<KbdGroup><Kbd label="Command">⌘</Kbd>…`}>
            <KbdGroup>
              <Kbd label="Command">⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
            <KbdGroup>
              <Kbd>Alt</Kbd>
              <Kbd>T</Kbd>
            </KbdGroup>
            <KbdGroup>
              <Kbd label="Shift">⇧</Kbd>
              <Kbd label="Enter">↵</Kbd>
            </KbdGroup>
          </Specimen>
          <Specimen label="Sizes" meta={`size="sm" | "md"`}>
            <Kbd size="sm">G</Kbd>
            <Kbd size="sm">Esc</Kbd>
            <Kbd>G</Kbd>
            <Kbd>Esc</Kbd>
            <Kbd label="Arrow up">↑</Kbd>
          </Specimen>
          <Specimen label="In a sentence" meta="inline">
            <p className="text-body-sm text-fg-2">
              Press <Kbd size="sm">G</Kbd> to toggle the grid, or{" "}
              <KbdGroup>
                <Kbd size="sm">Alt</Kbd>
                <Kbd size="sm">T</Kbd>
              </KbdGroup>{" "}
              to jump to notifications.
            </p>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Divider" note="1px rule; label and ruler ticks optional.">
        <SpecGrid cols={2}>
          <Specimen label="Plain · ticks" meta="<Divider /> <Divider ticks />" bodyClassName="flex-col items-stretch gap-8">
            <Divider />
            <Divider ticks />
          </Specimen>
          <Specimen label="Labelled" meta={`label align="start"`} bodyClassName="flex-col items-stretch gap-8">
            <Divider label="Source · Monad mainnet" />
            <Divider label="Readout" align="start" ticks />
          </Specimen>
        </SpecGrid>
        <Specimen label="Vertical" meta={`orientation="vertical"`} bodyClassName="min-h-20 flex-nowrap gap-4">
          <Label>Scenario</Label>
          <Divider orientation="vertical" />
          <Label>Result</Label>
          <Divider orientation="vertical" />
          <Label>Proof</Label>
        </Specimen>
      </DocBlock>

      <DocBlock title="Logo" note="Stepped fall: the last block is always liq. Hover the animated ones.">
        <SpecGrid cols={3}>
          <Specimen label="Mark · 16 24 32 48" meta="<LogoMark size={32} />" bodyClassName="items-end gap-6">
            {[16, 24, 32, 48].map((size) => (
              <span key={size} className="flex flex-col items-center gap-2.5">
                <LogoMark size={size} className="text-fg-1" />
                <Label>{size}</Label>
              </span>
            ))}
          </Specimen>
          <Specimen label="Lockup" meta="<Logo size={20} />" bodyClassName="flex-col items-start gap-5">
            <Logo size={16} />
            <Logo size={20} />
            <Logo size={28} />
          </Specimen>
          <Specimen label="Animated · hover" meta="animated" bodyClassName="flex-col items-start gap-5">
            <Logo size={28} animated />
            <span className="flex items-center gap-4">
              <LogoMark size={48} animated className="text-fg-1" />
              <span className="grid place-items-center rounded-control bg-fg-1 p-2 text-bg">
                <LogoMark size={32} animated />
              </span>
            </span>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Section header" note="Eyebrow, headline with one serif accent, lead, actions.">
        <Specimen label="align start" meta={`<SectionHeader index="02" kicker=… title={<>… <em>…</em></>} />`} bodyClassName="block p-6 lg:p-10">
          <SectionHeader
            index="02"
            kicker="How it works"
            title={
              <>
                One transaction. <em>Every</em> liquidation wave.
              </>
            }
            description="Kaskad replays a depeg across every real Aave borrower on Monad, inside a single transaction anyone can verify."
            actions={
              <>
                <Button variant="primary">
                  Run the stress test <ButtonArrow />
                </Button>
                <Button>Is my position safe?</Button>
              </>
            }
          />
        </Specimen>
        <Specimen label="align center · title size" meta={`align="center" size="title" as="h3"`} bodyClassName="block p-6 lg:p-10">
          <SectionHeader
            align="center"
            size="title"
            as="h3"
            index="04"
            kicker="Guard"
            title={
              <>
                A circuit breaker that <em>reads</em> the cascade.
              </>
            }
            description="KaskadGuard runs its stored scenario on the engine and pauses borrowing on market B when bad debt crosses its threshold."
          />
        </Specimen>
      </DocBlock>
    </DocSection>
  );
}

export function DataSection() {
  const demoAssets: DemoAsset[] = UI_ASSETS.map((a) => ({
    id: a.id,
    symbol: a.symbol,
    debtUsd: a.debtUsd,
    collateralUsd: a.collateralUsd,
    realPositions: a.realPositions,
    ethereum: a.symbol.includes("(Ethereum)"),
  }));

  return (
    <DocSection
      id="data"
      index="08"
      kicker="Components"
      title="Data"
      description="Numbers first: Geist Mono, tabular, rolling with NumberFlow and read out once, as text. Missing data is a skeleton of the same size, never 0."
    >
      <DocBlock title="Metric" note="xl · lg · md · sm. Values: deployment snapshot.">
        <SpecGrid cols={2}>
          <Specimen label="xl · hero" meta={`<Metric size="xl" format={usdCompact} tag={…} />`} bodyClassName="block">
            <Metric
              size="xl"
              label="Debt, all borrowers"
              tag={<HonestyTag kind="real">Real book · Monad Aave</HonestyTag>}
              value={totals.debtUsd}
              format={usdCompact}
              caption={`${int(source.borrowersWithDebt)} borrowers with debt · Monad mainnet block ${int(source.block)}`}
            />
          </Specimen>
          <Specimen label="lg · md · sm" meta={`size="lg" | "md" | "sm"`} bodyClassName="grid grid-cols-2 items-end gap-6">
            <Metric className="col-span-2" size="lg" label="Supplied" value={totals.suppliedUsd} format={usdCompact} />
            <Metric size="md" label="Borrowers" value={source.borrowersWithDebt} />
            <Metric size="sm" label="Borrower collateral" value={totals.borrowerCollateralUsd} format={usdCompact} />
          </Specimen>
        </SpecGrid>
        <SpecGrid cols={2}>
          <Specimen label="Tones" meta={`tone="liq"  (placeholder digits)`} bodyClassName="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            {TONES.map((tone) => (
              <Metric key={tone} size="sm" tone={tone} label={tone} value={123456789} />
            ))}
          </Specimen>
          <Specimen label="Missing value" meta="value={null}: same box, aria-busy" bodyClassName="grid grid-cols-2 items-end gap-6">
            <Metric className="col-span-2" size="lg" label="Can't be liquidated instantly" value={null} caption="Waiting for preview (eth_call)" />
            <Metric size="md" label="Pool can clear" value={null} skeletonChars={5} />
            <Metric size="sm" label="Liquidity gap" value={null} skeletonChars={5} />
          </Specimen>
        </SpecGrid>
        <Specimen label="Retarget · MetricGroup" meta="value changes roll from the current digits; Pause stops the cycle" bodyClassName="block p-6">
          <MetricCycleDemo assets={demoAssets} />
        </Specimen>
      </DocBlock>

      <DocBlock title="Readout" note="Key left, value right, hairline rows. null values are skeleton lines.">
        <SpecGrid cols={2}>
          <Specimen label="Deployment snapshot" meta="<Readout><ReadoutRow emphasis … /><ReadoutRow href=… />" bodyClassName="block p-4 sm:p-6">
            <Panel variant="glass" className="overflow-hidden">
              <PanelHeader
                title="Deployment"
                actions={
                  <Badge size="sm" variant="outline" mono tone="monad" icon={null}>
                    Testnet · {DEPLOYMENT.chainId}
                  </Badge>
                }
              />
              <Readout>
                <ReadoutRow
                  emphasis
                  label="Debt, all borrowers"
                  value={<MetricValue value={totals.debtUsd} format={usdCompact} size="lg" />}
                  caption={`${int(source.borrowersWithDebt)} borrowers · Monad Aave`}
                />
                <ReadoutRow label="Supplied" value={usd(totals.suppliedUsd)} />
                <ReadoutRow label="Positions" value={int(totals.positions)} />
                <ReadoutRow label="Source block" value={int(source.block)} />
                <ReadoutRow label="Deploy block" value={int(DEPLOYMENT.deployBlock)} />
                <ReadoutRow label="Engine" value={short(kaskad)} href={addrUrl(kaskad)} />
              </Readout>
            </Panel>
          </Specimen>
          <Specimen label="Loading · tones" meta="value={null}  tone=…" bodyClassName="block p-4 sm:p-6">
            <Panel className="overflow-hidden">
              <PanelHeader title="Scenario" />
              <Readout>
                <ReadoutRow emphasis label="Can't be liquidated instantly" value={null} caption="Waiting for preview" />
                <ReadoutRow label="Pool can clear" value={null} />
                <ReadoutRow label="Liquidity gap" value={null} skeletonChars={5} />
                <ReadoutRow label="Bad debt" tone="liq" value={`tone="liq"`} />
                <ReadoutRow label="Stuck debt" tone="warn" value={`tone="warn"`} />
                <ReadoutRow label="Guard" tone="safe" value={`tone="safe"`} />
              </Readout>
            </Panel>
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Tick ruler" note="SVG ticks stretch; strokes stay 1px and labels are HTML.">
        <Specimen label="Blocks · highlight" meta={`<TickRuler count={21} major={4} labels={…} highlight={{ index: 7, label }} />`} bodyClassName="block px-5 pt-8 pb-6 sm:px-8">
          <TickRuler
            count={21}
            major={4}
            labels={["Block 0", "4", "8", "12", "16", "20"]}
            highlight={{ index: 7, label: "Block 7 · highlight" }}
            label="Blocks 0 to 20, block 7 highlighted"
          />
        </Specimen>
        <SpecGrid cols={2}>
          <Specimen label="Function labels" meta="labels={(i) => …}" bodyClassName="block px-5 pt-6 pb-6">
            <TickRuler count={31} major={5} labels={(i) => (i === 0 ? "Shock 0%" : `−${i}%`)} />
          </Specimen>
          <Specimen label="Sizes · decorative" meta={`size="sm" | "lg", no label → aria-hidden`} bodyClassName="flex-col items-stretch gap-6 px-5 py-6">
            <TickRuler count={61} major={10} size="sm" />
            <TickRuler count={41} major={8} size="lg" highlight={{ index: 30, tone: "warn" }} />
          </Specimen>
        </SpecGrid>
      </DocBlock>
    </DocSection>
  );
}

const staticSteps = (active: number, error = false): Step[] =>
  ["Preparing burner wallet", "Sending", "Confirmed"].map((label, i) => ({
    id: label,
    label,
    status: error && i === active ? "error" : i < active ? "done" : i === active ? "active" : "pending",
    detail:
      error && i === active
        ? "Transaction reverted: BorrowIsPaused"
        : i === 0 && i < active
          ? "Sponsor topped up gas"
          : i === active && i === 0
            ? "Checking the burner balance"
            : undefined,
  }));

export function FeedbackSection() {
  return (
    <DocSection
      id="feedback"
      index="09"
      kicker="Components"
      title="Feedback and states"
      description="Loading, errors, empty results, transaction progress and the small print. States say what happened and what to do next."
    >
      <DocBlock title="Skeleton" note="Decorative (aria-hidden); the owner sets aria-busy. Shimmer only with motion allowed.">
        <SpecGrid cols={3}>
          <Specimen label="Skeleton" meta={`<Skeleton className="h-4 w-32" />`} bodyClassName="flex-col items-start gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-16 w-full rounded-control" />
          </Specimen>
          <Specimen label="SkeletonText" meta={`lines={3} className="text-body-sm"`} bodyClassName="block">
            <SkeletonText lines={3} className="text-body-sm" />
          </Specimen>
          <Specimen label="SkeletonMetric" meta={`size="xl" chars={7}`} bodyClassName="flex-col items-start gap-2">
            <SkeletonMetric size="xl" chars={6} />
            <SkeletonMetric size="md" chars={8} />
            <SkeletonMetric size="sm" chars={10} />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Callout" note="liq is role=alert; the rest role=status. The strip, icon and title all carry the tone.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout
            tone="liq"
            title="RPC unreachable"
            action={
              <Button size="sm">
                <RotateCcw aria-hidden /> Retry
              </Button>
            }
          >
            The Monad testnet RPC did not answer. Numbers below are from the last snapshot until it does.
          </Callout>
          <Callout tone="liq" title="Burner could not be funded">
            The sponsor could not top up gas for the burner wallet, so nothing was sent.
          </Callout>
          <Callout tone="liq" title="Transaction reverted: BorrowIsPaused">
            Market B is paused by KaskadGuard, so the borrow reverts. That is the guard working.
          </Callout>
          <Callout tone="warn" title="Worst-case oracle mode">
            The oracle follows the pool price, so each forced sale moves the price the next wave sees.
          </Callout>
          <Callout tone="calm" title="Realistic oracle mode">
            The oracle follows the Maple rate; pool slippage does not feed back into health factors.
          </Callout>
          <Callout
            tone="safe"
            title="Confirmed on Monad testnet"
            action={
              <Button size="sm" asChild>
                <a href={addrUrl(kaskad)} target="_blank" rel="noopener noreferrer">
                  MonadScan <span aria-hidden>↗</span>
                  <span className="sr-only">, opens in a new tab</span>
                </a>
              </Button>
            }
          >
            The result is on-chain and anyone can verify it.
          </Callout>
          <Callout tone="neutral" title="Preview is free">
            Previews run as eth_call. Nothing is signed or sent until you prove the result on-chain.
          </Callout>
          <Callout tone="monad" title="Runs on Monad testnet" live="off">
            Chain {DEPLOYMENT.chainId}. Positions are read from Monad mainnet Aave at block {int(source.block)}.
          </Callout>
        </div>
      </DocBlock>

      <DocBlock title="Empty state" note="Say what was checked and what to try next.">
        <SpecGrid cols={2}>
          <Specimen label="Default" meta="icon title body action" bodyClassName="block">
            <EmptyState
              icon={Waves}
              title="No liquidations at this shock"
              body="Every position stays above its liquidation threshold. Try a deeper shock or the worst-case oracle mode."
              action={<Button size="sm">Deepen the shock</Button>}
            />
          </Specimen>
          <Specimen label="Compact" meta="compact" bodyClassName="flex-col items-stretch gap-3">
            <EmptyState compact icon={Waves} title="No liquidations at this shock" body="All positions stay above their threshold." />
            <EmptyState
              compact
              icon={SearchX}
              title="No Aave position for this address"
              body="Checked Monad mainnet Aave. Paste another address or try a sample."
              action={
                <Button size="sm">Use a sample</Button>
              }
            />
          </Specimen>
        </SpecGrid>
      </DocBlock>

      <DocBlock title="Steps" note={`aria-current="step" on the active one; each status is also spoken.`}>
        <SpecGrid cols={4}>
          <Specimen label="Pending" meta={`status="pending"`} bodyClassName="block">
            <Steps steps={staticSteps(-1)} aria-label="Transaction progress" />
          </Specimen>
          <Specimen label="Active" meta={`status="active"`} bodyClassName="block">
            <Steps steps={staticSteps(0)} aria-label="Transaction progress" />
          </Specimen>
          <Specimen label="Done" meta={`status="done"`} bodyClassName="block">
            <Steps steps={staticSteps(3)} aria-label="Transaction progress" />
          </Specimen>
          <Specimen label="Error" meta={`status="error" detail`} bodyClassName="block">
            <Steps steps={staticSteps(1, true)} aria-label="Transaction progress" />
          </Specimen>
        </SpecGrid>
        <Specimen label="Replay" meta="client demo" bodyClassName="block">
          <StepsReplayDemo />
        </Specimen>
      </DocBlock>

      <DocBlock title="Footnote" note="Always visible under the number it qualifies. Never inside a tooltip.">
        <Specimen label="Model · honesty" meta={`<Footnote label="Model">`} bodyClassName="flex-col items-stretch gap-3">
          <Footnote>{MODEL_NOTE}</Footnote>
          <Footnote label="Real book" icon={BookOpen}>
            Monad Aave, {int(source.borrowersWithDebt)} borrowers with debt, read at Monad mainnet block {int(source.block)}.
          </Footnote>
          <Footnote label="Synthetic book" icon={FlaskConical}>
            Scale test only: generated positions that keep the real book&apos;s total debt.
          </Footnote>
        </Specimen>
      </DocBlock>

      <DocBlock title="Toast" note="Sonner, unstyled, token surfaces. Bottom right; Alt+T focuses the stack.">
        <Specimen label="notify(title, { tone })" meta="toast.success / error / warning / info also map to tones" bodyClassName="block">
          <ToastDemo />
        </Specimen>
      </DocBlock>
    </DocSection>
  );
}
