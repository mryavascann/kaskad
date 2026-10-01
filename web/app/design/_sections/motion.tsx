import type { ReactNode } from "react";
import { DEPLOYMENT, UI_ASSETS } from "@/lib/kaskad/config";
import { DocBlock, DocSection, SpecGrid, Specimen } from "../_components/doc";
import {
  ChoreographyDemo,
  DurationsDemo,
  EasingDemo,
  MagneticDemo,
  MotionLab,
  RevealDemo,
  RiseDemo,
  SpotlightDemo,
  SplitTextDemo,
  SpringDemos,
  StaggerDemo,
  type ChoreographyData,
} from "./motion-demos";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US");

/** Real numbers only: the Monad Aave snapshot the deployment was calibrated from. */
const choreography: ChoreographyData = {
  context: "Monad Aave snapshot",
  block: `Block #${integer.format(DEPLOYMENT.source.block)}`,
  heroLabel: "Total debt",
  hero: usd.format(DEPLOYMENT.totals.debtUsd),
  details: [
    ["Borrowers with debt", integer.format(DEPLOYMENT.totals.positions)],
    ["Supplied", usd.format(DEPLOYMENT.totals.suppliedUsd)],
    ["Borrower collateral", usd.format(DEPLOYMENT.totals.borrowerCollateralUsd)],
  ],
};

const assetDebt = UI_ASSETS.slice(0, 3).map((asset) => [asset.symbol, usd.format(asset.debtUsd)] as const);

/** A token or API name inside running text: mono, never broken across lines. */
const Token = ({ children }: { children: ReactNode }) => <code className="whitespace-nowrap text-fg-1">{children}</code>;

const RULES: readonly (readonly [string, ReactNode])[] = [
  ["Motion is causality", "Every animation explains data or a cause: wave, price drop, next wave. Nothing moves for decoration."],
  ["Context, hero, detail", "Context first, then the hero number, details last. At most two heroes move at once."],
  [
    "Transform and opacity",
    <>
      Nothing else animates. <Token>will-change</Token> only while a scene is running, never left on.
    </>,
  ],
  [
    "Reduced motion keeps every fact",
    <>
      No travel, parallax or 3D; short fades stay. <Token>--rise</Token>, <Token>--nudge</Token> and <Token>--enter</Token> become 0px.
    </>,
  ],
  ["Every control answers", "Hover, press and focus on everything clickable. Magnetic pull and glow only for a fine pointer, and subtle."],
  ["Interruptible", "A new target retargets the running spring with its velocity. Nothing restarts from zero."],
  [
    "Demo mode is deterministic",
    <>
      <Token>?demo=1</Token> seeds every random choice with <Token>DEMO_SEED</Token> and fixes the timings for recordings.
    </>,
  ],
];

const TOOLS = [
  ["Above the fold", ["animate-rise", "<SplitText>"], "CSS at first paint. No hydration wait, so LCP is not delayed."],
  ["Below the fold", ["<Reveal>", "<Stagger>"], "Plays once in view. Hidden until then; <RevealNoScript> covers no-JS."],
  ["Changing data", ["useSpring", "animate(value)"], "Springs retarget with their velocity: a new value never restarts the motion."],
  ["Hover, press, focus", ["duration-(--dur-fast)", "ease-out-quart"], "CSS transitions. <Magnetic> and <Spotlight> only for desktop pointers."],
  ["Loops", ["motion-safe:animate-live"], "Live dots and skeleton sweeps. Still under reduced motion."],
  ["Canvas, WebGL, plots", ["ease.*", "springStep", "mulberry32"], "The same curves and springs outside the DOM, seeded in demo mode."],
  ["Scroll scenes", ["GSAP + ScrollTrigger"], "Reserved for the stage 4 landing: scrubbed, pinned scenes. Not installed yet."],
] as const;

function Rules() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-2 xl:grid-cols-4">
      {RULES.map(([title, body], i) => (
        <li key={title} className="flex flex-col gap-2 bg-elev-1 p-5">
          <span className="label-mono text-fg-3">M{i + 1}</span>
          <h4 className="text-body font-medium text-fg-1">{title}</h4>
          <p className="text-body-sm text-fg-2">{body}</p>
        </li>
      ))}
      <li className="flex flex-col gap-2 bg-bg p-5">
        <span className="label-mono text-fg-3">Source</span>
        <p className="text-body-sm text-fg-2">
          Tokens in <code className="text-fg-1">motion/tokens.ts</code> and <code className="text-fg-1">tokens.css</code>, primitives and rules in{" "}
          <code className="text-fg-1">motion/README.md</code>. Flip <span className="text-fg-1">Simulate reduced motion</span> to audit every demo
          below.
        </p>
      </li>
    </ol>
  );
}

function ToolTable() {
  const columns = "md:grid-cols-[10.5rem_minmax(0,17rem)_minmax(0,1fr)]";
  return (
    <div className="overflow-hidden rounded-panel border border-line-2">
      <div aria-hidden className={`hidden gap-6 border-b border-line bg-elev-2 px-5 py-2.5 md:grid ${columns}`}>
        <span className="label-mono text-fg-3">Job</span>
        <span className="label-mono text-fg-3">Tool</span>
        <span className="label-mono text-fg-3">Why</span>
      </div>
      <dl className="divide-y divide-line bg-elev-1">
        {TOOLS.map(([job, tool, why]) => (
          <div key={job} className={`grid gap-1.5 px-5 py-3.5 md:gap-6 ${columns}`}>
            <dt className="text-body-sm font-medium text-fg-1">{job}</dt>
            <dd className="flex min-w-0 flex-wrap content-start gap-x-3 gap-y-1">
              {tool.map((name) => (
                <code key={name} className="text-caption whitespace-nowrap text-monad-hi">
                  {name}
                </code>
              ))}
            </dd>
            <dd className="text-body-sm text-fg-2">{why}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MotionSection() {
  return (
    <DocSection
      id="motion"
      index="06"
      kicker="Motion"
      title={
        <>
          Quiet at rest, <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">waves on impact.</em>
        </>
      }
      description="Seismograph × domino: the instrument sits still, a shock arrives and travels in waves. Every movement explains data or causality, takes its timing from tokens and keeps its meaning when motion is reduced."
    >
      <MotionLab>
        <DocBlock title="Rules" note="Enforced by the primitives in motion/*">
          <Rules />
        </DocBlock>

        <DocBlock title="Duration" note={<code>duration.* · duration-(--dur-*)</code>}>
          <DurationsDemo />
        </DocBlock>

        <DocBlock title="Easing" note={<code>ease-out-expo · transition.base · ease.outExpo(t)</code>}>
          <EasingDemo />
        </DocBlock>

        <DocBlock title="Springs" note={<code>spring.soft · spring.impact · spring.needle</code>}>
          <SpringDemos />
        </DocBlock>

        <DocBlock title="Stagger" note={<code>{"<Stagger gap> · stagger.tight | base | loose"}</code>}>
          <StaggerDemo />
        </DocBlock>

        <DocBlock title="Choreography" note="Context first, the hero number second, details last">
          <ChoreographyDemo data={choreography} />
        </DocBlock>

        <DocBlock title="Primitives" note="motion/reveal · split-text · magnetic · spotlight">
          <SpecGrid cols={2}>
            <Specimen label="Reveal · below the fold" meta={"<Reveal as delay once amount>"} bodyClassName="items-start">
              <RevealDemo />
            </Specimen>
            <Specimen label="animate-rise · above the fold" meta={'className="animate-rise"'} bodyClassName="items-start">
              <RiseDemo />
            </Specimen>
            <Specimen className="md:col-span-2" label="SplitText · headlines, pure CSS" meta={"<SplitText lines accent={[2]} />"} bodyClassName="items-start py-8 sm:px-8">
              <SplitTextDemo />
            </Specimen>
            <Specimen label="Magnetic · fine pointer only" meta={"<Magnetic strength={6}>"} bodyClassName="items-start">
              <MagneticDemo />
            </Specimen>
            <Specimen label="Spotlight · fine pointer only" meta={"<Spotlight size={260} intensity={0.06}>"} bodyClassName="items-start">
              <SpotlightDemo rows={assetDebt} caption="Monad snapshot" />
            </Specimen>
          </SpecGrid>
        </DocBlock>

        <DocBlock title="Which tool for which job" note="motion/README.md">
          <ToolTable />
        </DocBlock>
      </MotionLab>
    </DocSection>
  );
}
