import type { ReactNode } from "react";
import { monteCarloFacts } from "@/lib/chain/engine";
import { limitFacts } from "@/lib/chain/limits";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { Footnote } from "@/design/ui/footnote";
import { HonestyTag } from "@/design/ui/honesty";
import { MotionLab } from "./motion-demos";
import { DocBlock, DocSection, SpecGrid, Specimen } from "../_components/doc";
import { HealthDialDemo, LiveBlockDemo, ReplayDemo, type DialReading, type ReplayRun } from "./viz-demos";
import { vizRun, type VizRun } from "@/viz/__fixtures__/data";
import { VIZ_BLOCK, VIZ_CALIBRATED, VIZ_CURVE, vizMonteCarlo } from "@/viz/__fixtures__/load";
import { BlockPulse } from "@/viz/block-pulse";
import { curveFromChain } from "@/viz/curve-model";
import { GapBars } from "@/viz/gap-bars";
import { GasGauge } from "@/viz/gas-gauge";
import { HealthDial } from "@/viz/health-dial";
import { MonteCarloChart } from "@/viz/monte-carlo-chart";
import { PositionRings } from "@/viz/position-rings";
import { PositionTiles } from "@/viz/position-tiles";
import type { VizPosition } from "@/viz/positions";
import { StressCurve } from "@/viz/stress-curve";
import { WaveTimeline } from "@/viz/wave-timeline";

// Everything below is computed from recorded chain data at render time (Server Component):
// lib/chain/__fixtures__/engine-runs.json (real books + on-chain previews) and
// viz/__fixtures__/viz-runs.json (stress curve, Monte Carlo, calibrated preview), all eth_call only.

const int = new Intl.NumberFormat("en-US");
const recorded = (block: number) => `Recorded preview, block ${int.format(block)}`;
const symbolOf = (assetId: number) => DEPLOYMENT.assets[assetId & 0xff]?.symbol ?? `#${assetId}`;

/** "syrupUSDC −3%, external price", from the run's scenario. */
const shockText = ({ run }: VizRun) => `−${run.scenario.shockBps / 100}%`;
const scenarioText = (r: VizRun) =>
  `${symbolOf(r.run.scenario.assetId)} ${shockText(r)}, ${r.run.scenario.oracleFeedbackBps > 0 ? "pool price" : "external price"}`;

function describe(r: VizRun) {
  const s = r.run.scenario;
  return `${recorded(r.block)} · ${scenarioText(r)} · real book, ${s.maxPositions} positions, ${s.steps} blocks, ${s.maxRoundsPerStep} waves per block`;
}

const RUN_LABEL: Record<string, string> = {
  sali: "syrupUSDC · external",
  worst: "syrupUSDC · pool",
  "usde-eth-5-external": "USDe · external",
  "usde-eth-5-pool": "USDe · pool",
};

const RULES: readonly (readonly [string, ReactNode])[] = [
  ["Data only", "Every mark is a number from a run. Charts replay results; they never smooth, fill in or add noise."],
  ["Same scale", "Bars that are compared share one linear scale, even when one of them is a hairline."],
  ["Never color alone", "Outcomes have their own pattern and icon, oracle modes their own dash and marker."],
  ["Same box in every state", "Loading, empty and error keep the plot's size; the markup is identical on the server and in the browser."],
  ["Readable without the chart", "role=\"img\" summaries for screen readers and a data table behind every chart."],
  ["Motion explains", "Draw-in, flips and springs follow the data; reduced motion keeps every fact and drops the travel."],
];

function Rules() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-2 xl:grid-cols-3">
      {RULES.map(([title, body], i) => (
        <li key={title} className="flex flex-col gap-2 bg-elev-1 p-5">
          <span className="label-mono text-fg-3">V{i + 1}</span>
          <h4 className="text-body font-medium text-fg-1">{title}</h4>
          <p className="text-body-sm text-fg-2">{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function VizSection() {
  const replays = (["sali", "worst", "usde-eth-5-external", "usde-eth-5-pool"] as const).map(vizRun);
  const [saliRun, worstRun, , usdePoolRun] = replays;
  const runs: ReplayRun[] = replays.map((r) => ({
    id: r.name,
    label: RUN_LABEL[r.name] ?? r.name,
    source: describe(r),
    shock: r.shock,
    timeline: r.timeline,
    positions: r.positions,
  }));
  const sali = saliRun.run;

  const curve = curveFromChain(VIZ_CURVE, VIZ_CURVE.shocksBps);
  const mcWorst = vizMonteCarlo("worst");
  const mcSali = vizMonteCarlo("sali");
  const calibratedLimits = limitFacts(VIZ_CALIBRATED.result);
  const saliLimits = limitFacts(sali.result);
  const saliBlock = saliRun.block;
  const pool = DEPLOYMENT.assets[9];

  const saliPositions = saliRun.positions.consistent ? saliRun.positions.positions : [];
  const usdePositions = usdePoolRun.positions.consistent ? usdePoolRun.positions.positions : [];
  const largest = saliPositions.reduce<VizPosition | null>((a, p) => (!a || p.debtUsd > a.debtUsd ? p : a), null);
  const safest = saliPositions.find((p) => p.outcome === "safe" && p.healthFactor > 1.5 && p.healthFactor < 3);
  const repaid = usdePositions.find((p) => p.finalHealthFactor === null);
  const readings: DialReading[] = [];
  if (largest) {
    readings.push({
      label: `#${largest.index} before`,
      value: largest.healthFactor,
      caption: `Largest syrupUSDC borrower (#${largest.index}) before the shock · ${recorded(saliBlock)}`,
    });
    if (largest.finalHealthFactor !== null) {
      readings.push({
        label: `#${largest.index} after ${shockText(saliRun)}`,
        value: largest.finalHealthFactor,
        caption: `Same position after the ${shockText(saliRun)} cascade (external price) · ${recorded(saliBlock)}`,
      });
    }
  }
  if (safest) readings.push({ label: `#${safest.index}`, value: safest.healthFactor, caption: `Position #${safest.index} before the shock · ${recorded(saliBlock)}` });

  return (
    <DocSection
      id="viz"
      index="12"
      kicker="Data visualization"
      title={
        <>
          Every mark, <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">a number.</em>
        </>
      }
      description="Charts for the cascade engine, all fed with recorded Monad testnet results (eth_call, pinned to a block) and replayed offline. SVG with a fixed viewBox, text in HTML, the same markup on the server and in the browser."
    >
      <MotionLab>
        <DocBlock title="Rules" note="viz/README.md">
          <Rules />
        </DocBlock>

        <DocBlock title="Replay · one step, three views" note={<code>{"<WaveTimeline step onStepChange /> · <PositionTiles step steps prices /> · <PositionRings />"}</code>}>
          <Specimen label="Shared scrubber · recorded runs" meta="scrub, arrow keys, or Play" bodyClassName="block p-4 sm:p-6">
            <ReplayDemo runs={runs} />
          </Specimen>
        </DocBlock>

        <DocBlock title="WaveTimeline · trace" note={<code>{'variant="trace"'}</code>}>
          <SpecGrid cols={2}>
            <Specimen label={`Finding · ${recorded(saliBlock)}`} meta={scenarioText(saliRun)} bodyClassName="block p-4 sm:p-6">
              <WaveTimeline timeline={saliRun.timeline} variant="trace" plotClassName="h-44 sm:h-52" />
            </Specimen>
            <Specimen label={`Pool-price spiral · ${recorded(worstRun.block)}`} meta={scenarioText(worstRun)} bodyClassName="block p-4 sm:p-6">
              <WaveTimeline timeline={worstRun.timeline} variant="trace" plotClassName="h-44 sm:h-52" />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="PositionTiles" note="Closest to liquidation first; pattern + icon per outcome">
          <SpecGrid cols={2}>
            <Specimen label={`All four outcomes · ${recorded(usdePoolRun.block)}`} meta={scenarioText(usdePoolRun)} bodyClassName="block p-4 sm:p-6">
              <PositionTiles classification={usdePoolRun.positions} table={false} />
            </Specimen>
            <Specimen label={`weight="debt" · ${recorded(saliBlock)}`} meta={scenarioText(saliRun)} bodyClassName="block p-4 sm:p-6">
              <PositionTiles classification={saliRun.positions} weight="debt" table={false} />
            </Specimen>
            <Specimen label={`Loading · expectedCount={${sali.scenario.maxPositions}}`} meta="same box as the tiles" bodyClassName="block p-4 sm:p-6">
              <PositionTiles classification={null} expectedCount={sali.scenario.maxPositions} />
            </Specimen>
            <Specimen label="Replay mismatch" meta="classification.consistent === false" bodyClassName="block p-4 sm:p-6">
              <PositionTiles classification={{ consistent: false, bookId: 9, mismatches: [{ field: "stuckDebt", engine: "…", replay: "…" }] }} />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="PositionRings" note="Distance = price drop to liquidation, area = debt">
          <SpecGrid cols={2}>
            <Specimen label={`End state · ${recorded(usdePoolRun.block)}`} meta={scenarioText(usdePoolRun)} bodyClassName="block p-4 sm:p-6">
              <PositionRings classification={usdePoolRun.positions} shock={usdePoolRun.shock} table={false} />
            </Specimen>
            <Specimen label="Loading" meta="aspect-square box" bodyClassName="block p-4 sm:p-6">
              <PositionRings classification={null} shock={null} />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="GapBars" note="Same linear scale; the ratio is computed from the two inputs">
          <SpecGrid cols={2}>
            <Specimen label={`The finding · ${recorded(saliBlock)}`} meta="stuckDebt vs totalLiquidated" bodyClassName="block p-4 sm:p-6">
              <GapBars
                cleared={wadToNum(sali.result.totalLiquidated)}
                stuck={wadToNum(sali.result.stuckDebt)}
                footnote={
                  <Footnote>
                    One {pool.symbol} exit pool of ${int.format(Math.round(pool.depthUsd))}{" "}
                    <HonestyTag kind={pool.depthIsAssumption ? "assumption" : "measured"} />, instant-sale (flash-loan) liquidator.
                  </Footnote>
                }
              />
            </Specimen>
            <Specimen label="Loading" meta="cleared={null} stuck={null}" bodyClassName="block p-4 sm:p-6">
              <GapBars cleared={null} stuck={null} />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="StressCurve" note="Log shock axis; dash, marker and icon tell the oracle modes apart">
          <Specimen label={`${recorded(VIZ_BLOCK)} · previewCurve, syrupUSDC real book`} meta="hover, or focus + arrow keys" bodyClassName="block p-4 sm:p-6">
            <StressCurve data={curve} marker={sali.scenario.shockBps / 10_000} />
          </Specimen>
          <SpecGrid cols={2}>
            <Specimen label="Loading" meta="data={null}" bodyClassName="block p-4 sm:p-6">
              <StressCurve data={null} plotClassName="h-48" />
            </Specimen>
            <Specimen label="Error" meta="error={…}" bodyClassName="block p-4 sm:p-6">
              <StressCurve data={null} error="eth_call failed: the RPC answered 429 (rate limited)." plotClassName="h-48" />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="MonteCarloChart" note="One dot per path; mean, p95 and the worst path">
          <SpecGrid cols={2}>
            <Specimen label={`${recorded(VIZ_BLOCK)} · pool price, ${mcWorst.paths} paths`} meta="previewMC, KaskadMC, seed 1" bodyClassName="block p-4 sm:p-6">
              <MonteCarloChart facts={monteCarloFacts(mcWorst.result)} />
            </Specimen>
            <Specimen label={`${recorded(VIZ_BLOCK)} · external price, ${mcSali.paths} paths`} meta="no path loses: the chart says so" bodyClassName="block p-4 sm:p-6">
              <MonteCarloChart facts={monteCarloFacts(mcSali.result)} />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="GasGauge" note="Monad measured, Ethereum estimated, one shared scale">
          <SpecGrid cols={2}>
            <Specimen
              label={`${recorded(VIZ_BLOCK)} · calibrated book, ${int.format(VIZ_CALIBRATED.result.positionsUsed)} positions`}
              meta="limitFacts(result)"
              bodyClassName="block p-4 sm:p-6"
            >
              <GasGauge facts={calibratedLimits} />
            </Specimen>
            <Specimen label={`${recorded(saliBlock)} · real book, ${saliLimits.positions} positions`} meta="both fit" bodyClassName="block p-4 sm:p-6">
              <GasGauge facts={saliLimits} />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="HealthDial" note={<code>spring.needle · zone-weighted scale</code>}>
          <SpecGrid cols={3}>
            <Specimen label="Retarget · switch readings" meta="real positions, recorded book" bodyClassName="justify-center p-6">
              <HealthDialDemo readings={readings} />
            </Specimen>
            <Specimen label="No debt · Infinity" meta={repaid ? `#${repaid.index} after ${scenarioText(usdePoolRun)}` : "value={Infinity}"} bodyClassName="justify-center p-6">
              <HealthDial value={Infinity} caption={repaid ? `Position #${repaid.index}: debt fully repaid · ${recorded(usdePoolRun.block)}` : undefined} />
            </Specimen>
            <Specimen label="Loading" meta="value={null}" bodyClassName="justify-center p-6">
              <HealthDial value={null} />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="BlockPulse" note="One cell per block, at the pace observed between polls">
          <SpecGrid cols={3}>
            <Specimen label="Live · Monad testnet" meta="useLiveBlock() → block" bodyClassName="block p-6">
              <LiveBlockDemo />
            </Specimen>
            <Specimen label="Loading" meta="block={null}" bodyClassName="block p-6">
              <BlockPulse block={null} />
            </Specimen>
            <Specimen label="Interrupted" meta="error" bodyClassName="block p-6">
              <BlockPulse block={BigInt(VIZ_BLOCK)} error="rate-limited" />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="States" note="Same box as the chart; an empty result says what was checked">
          <SpecGrid cols={3}>
            <Specimen label="Timeline · loading" meta="timeline={null}" bodyClassName="block p-4 sm:p-6">
              <WaveTimeline timeline={null} plotClassName="h-40" />
            </Specimen>
            <Specimen label="Timeline · empty" meta="points.length < 2" bodyClassName="block p-4 sm:p-6">
              <WaveTimeline timeline={{ points: saliRun.timeline.points.slice(0, 1), stalled: false, lastActiveStep: 0 }} plotClassName="h-40" />
            </Specimen>
            <Specimen label="Timeline · error" meta="error={…}" bodyClassName="block p-4 sm:p-6">
              <WaveTimeline timeline={null} error="The preview reverted: out of gas at 30M." plotClassName="h-40" />
            </Specimen>
          </SpecGrid>
        </DocBlock>
      </MotionLab>
    </DocSection>
  );
}
