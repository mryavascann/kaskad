import type { ReactNode } from "react";
import { HonestyTag } from "@/design/ui/honesty";
import { classifyPositions } from "@/lib/chain/book";
import { FIXTURE_BLOCKS, fixtureRun } from "@/lib/chain/__fixtures__/load";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { wadToNum } from "@/lib/kaskad/format";
import { heroFromClassification } from "@/three/data";
import { HeroPoster } from "@/three/hero-poster";
import type { HeroPosition } from "@/three/model";
import { DocBlock, DocSection, Specimen } from "../_components/doc";
import { HeroSceneLab, type HeroLabData } from "./three-demos";

const integer = new Intl.NumberFormat("en-US");

/** The recorded syrupUSDC −3 % preview (the landing's finding), classified per position on the server. */
function recordedFinding(): (HeroLabData & { counts: Record<string, number>; partial: number }) | null {
  const run = fixtureRun("sali");
  const classification = classifyPositions(run.book, run.result, run.scenario);
  if (!classification.consistent) return null;
  const { positions, timeline } = heroFromClassification(classification.positions, run.scenario, { result: run.result });
  return {
    positions,
    timeline,
    placeholderCount: DEPLOYMENT.assets[run.scenario.assetId].realPositions,
    startPrice: wadToNum(run.result.startPrice),
    source: `Recorded preview, block ${integer.format(Number(BigInt(FIXTURE_BLOCKS.book9)))}`,
    counts: classification.counts,
    partial: classification.positions.filter((p) => p.outcome !== "liquidated" && p.liquidationEvents > 0).length,
  };
}

/** A token or API name inside running text: mono, never broken across lines. */
const Token = ({ children }: { children: ReactNode }) => <code className="whitespace-nowrap text-fg-1">{children}</code>;

const MAPPING: readonly (readonly [string, ReactNode])[] = [
  ["One domino", "One real borrower of the book, from classifyPositions() over the on-chain preview. No data yet: neutral, upright dominoes, nothing encoded."],
  ["Row order", "Distance to liquidation (the price drop at which the position becomes liquidatable). The closest stands first and tips first."],
  ["Height", "Debt at the start of the run, log-compressed over four decades so the largest borrower does not dwarf the rest."],
  [
    "When it tips",
    <>
      The block in which the price crosses its liquidation price (logged oracle prices when the oracle follows the pool). Same-block tips stagger
      in row order. <Token>progress</Token> maps linearly to blocks; the landing timeline starts half a block before the first tip.
    </>,
  ],
  ["Stuck (amber)", "Tips and freezes at a lean, or rests on the next domino: under the threshold, but no instant-sale liquidator can clear it."],
  ["Liquidated, bad debt (red)", "Falls until it rests on the next dominoes. Bad debt glows hotter and tints its faces."],
  ["Partly liquidated", "Flashes red in the block of its liquidation and keeps a red foot under the amber: hit, still stuck."],
  ["Safe (dark)", "Never moves. Its edge only warms toward amber as the price closes in on its liquidation price."],
];

const GUARDS: readonly (readonly [string, ReactNode])[] = [
  [
    "Lazy chunk",
    <>
      <Token>HeroScene</Token> (three.js, R3F, postprocessing) loads through <Token>next/dynamic</Token> with <Token>ssr: false</Token>, after the
      first paint, when the browser is idle and the stage is near the viewport.
    </>,
  ],
  [
    "Poster first",
    <>
      The server renders <Token>HeroPoster</Token>: the same model and camera projected to SVG, cropped like the canvas. The canvas cross-fades in
      when its first frame is on screen, so nothing shifts.
    </>,
  ],
  [
    "Poster only",
    "Reduced motion, no WebGL 2, a software renderer, ≤ 2 cores, ≤ 2 GB memory or the data saver keep the poster, at the final state.",
  ],
  ["On demand", "frameloop demand: a frame only when progress, the pointer, the size or the quality changes. Idle costs nothing."],
  [
    "Frame budget",
    "Runs of consecutive frames over 20 ms (and 1.5× the refresh interval) step down: bloom and MSAA off, pixel ratio from 1.75 to 1.25, then 1.",
  ],
  ["Paused", "Off screen (IntersectionObserver) or in a hidden tab the frame loop stops. Geometry, materials and the renderer are disposed on unmount."],
];

/** The same final frame in three container shapes: the frame covers each box like object-fit: cover. */
function Framings({ positions, placeholderCount }: { positions: HeroPosition[]; placeholderCount: number }) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Specimen label="Hero band · 21:9" meta="wide framing, cropped top and bottom" bodyClassName="p-0">
          <div className="relative aspect-[21/9] w-full">
            <HeroPoster positions={positions} progress={1} />
          </div>
        </Specimen>
        <Specimen label="Loading · no data" meta={`${placeholderCount} neutral dominoes`} bodyClassName="p-0">
          <div className="relative aspect-[21/9] w-full">
            <HeroPoster placeholderCount={placeholderCount} />
          </div>
        </Specimen>
      </div>
      <Specimen label="Phone · 9:16" meta="tall framing" bodyClassName="p-0">
        <div className="relative aspect-[9/16] w-full">
          <HeroPoster positions={positions} progress={1} />
        </div>
      </Specimen>
    </div>
  );
}

function NoteList({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-panel border border-line-2 bg-elev-1">
      {items.map(([term, detail]) => (
        <div key={term} className="grid gap-1.5 px-5 py-3.5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6">
          <dt className="text-body-sm font-medium text-fg-1">{term}</dt>
          <dd className="text-body-sm text-fg-2">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ThreeSection() {
  const data = recordedFinding();
  return (
    <DocSection
      id="three"
      index="13"
      kicker="3D"
      title={
        <>
          Monoliths, <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">one per borrower.</em>
        </>
      }
      description="The landing hero: a row of dark monoliths in the dark, one per real position of the book, that tips over as the price falls. The animation only replays the recorded result."
    >
      <DocBlock
        title="Live scene"
        note={
          data ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <HonestyTag kind="real" />
              {data.source} · syrupUSDC −3 % · {data.positions.length} positions: {data.counts.stuck} stuck ({data.partial} partly liquidated),{" "}
              {data.counts.safe} safe
            </span>
          ) : undefined
        }
      >
        {data ? (
          <HeroSceneLab data={data} />
        ) : (
          <p className="text-body text-fg-3">The replay did not reproduce the recorded preview, so there are no per-position outcomes to show.</p>
        )}
      </DocBlock>

      {data && (
        <DocBlock title="Framings" note={<code>framingFor() · frameCrop() · &lt;HeroPoster /&gt;</code>}>
          <Framings positions={data.positions} placeholderCount={data.placeholderCount} />
        </DocBlock>
      )}

      <DocBlock title="Data → scene" note={<code>heroFromClassification() · buildHeroModel() · poseAt()</code>}>
        <NoteList items={MAPPING} />
      </DocBlock>

      <DocBlock title="Performance guards" note={<code>HeroStage · chooseHeroMode() · FrameBudget</code>}>
        <NoteList items={GUARDS} />
      </DocBlock>
    </DocSection>
  );
}
