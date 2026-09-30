import type { Metadata } from "next";
import { Eyebrow } from "@/design/ui/label";
import { ControlsSection, OverlaysSection } from "./_sections/controls";
import { DataSection, DisplaySection, FeedbackSection } from "./_sections/display";
import { ColorSection, IconSection, LayoutSection, SurfaceSection, TypeSection } from "./_sections/foundations";
import { MotionSection } from "./_sections/motion";
import { GridOverlayToggle } from "./_components/grid-overlay";

export const metadata: Metadata = {
  title: "Design system · Kaskad",
  description: "Tokens, type, grid, motion and components of the Kaskad interface.",
  robots: { index: false, follow: false },
};

const toc = [
  { group: "Foundations", items: [["color", "Color"], ["type", "Type"], ["layout", "Layout"], ["surfaces", "Surfaces"], ["icons", "Icons"]] },
  { group: "Motion", items: [["motion", "Motion"]] },
  { group: "Components", items: [["display", "Display"], ["data", "Data"], ["feedback", "Feedback"], ["controls", "Controls"], ["overlays", "Overlays"]] },
] as const;

const principles = [
  ["Numbers first", "One hero metric per screen, set in Geist Mono with tabular figures. Copy supports the number, never the reverse."],
  ["Calm, then alarm", "Blue-grey when nothing moves; amber below threshold; red for liquidation. Color is always paired with an icon or a word."],
  ["Motion is causality", "Things move to show a wave, a price drop, the next wave. Nothing moves for decoration; reduced motion keeps every fact."],
  ["Honest labels", "Measured, assumed, synthetic and estimated values say so, right where the number is."],
] as const;

const sections = {
  color: ColorSection,
  type: TypeSection,
  layout: LayoutSection,
  surfaces: SurfaceSection,
  icons: IconSection,
  motion: MotionSection,
  display: DisplaySection,
  data: DataSection,
  feedback: FeedbackSection,
  controls: ControlsSection,
  overlays: OverlaysSection,
} as const;

type SectionId = keyof typeof sections;

/** `/design?only=motion` renders a single section (handy for screenshots and reviews). */
export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ only?: string }> }) {
  const { only } = await searchParams;
  const focus = only && only in sections ? (only as SectionId) : null;
  const visible = focus ? [focus] : (Object.keys(sections) as SectionId[]);
  return (
    <div lang="en" className="flex min-h-dvh flex-col bg-bg text-body text-fg-1">
      <header className="sticky top-0 z-(--z-nav) border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="page-shell flex h-14 items-center justify-between gap-4">
          <p className="flex items-baseline gap-3">
            <span className="text-body font-semibold tracking-[-0.02em]">kaskad</span>
            <span className="label-mono text-fg-3">Design system</span>
          </p>
          <GridOverlayToggle />
        </div>
      </header>

      <div className="page-shell flex-1 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Design system sections" className="hidden lg:block">
          <div className="sticky top-20 flex flex-col gap-6 py-12">
            {toc.map(({ group, items }) => (
              <div key={group} className="flex flex-col gap-2">
                <p className="label-mono text-fg-3">{group}</p>
                <ul className="flex flex-col">
                  {items.map(([id, label]) => (
                    <li key={id}>
                      <a href={`#${id}`} className="block rounded-tag py-1 text-body-sm text-fg-2 transition-colors duration-(--dur-fast) hover:text-fg-1">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main id="main" className="min-w-0">
          {!focus && <section aria-labelledby="intro-title" className="pt-16 pb-16 lg:pt-24">
            <Eyebrow index="00">Instrument language</Eyebrow>
            <h1 id="intro-title" className="mt-6 max-w-4xl text-display text-fg-1">
              Cascade, <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">measured.</em>
            </h1>
            <p className="mt-6 max-w-2xl text-lead text-fg-2">
              Kaskad is an early-warning instrument: cold and quiet at rest, red and amber when a shock runs through the
              book. These are the tokens, type, grid, motion and components every page is built from.
            </p>
            <ul className="mt-12 grid gap-px overflow-hidden rounded-panel border border-line-2 bg-line-2 sm:grid-cols-2 xl:grid-cols-4">
              {principles.map(([title, body], i) => (
                <li key={title} className="flex flex-col gap-3 bg-elev-1 p-5">
                  <span className="label-mono text-fg-3">P{i + 1}</span>
                  <h2 className="text-title-3 text-fg-1">{title}</h2>
                  <p className="text-body-sm text-fg-2">{body}</p>
                </li>
              ))}
            </ul>
          </section>}

          {visible.map((id) => {
            const Section = sections[id];
            return <Section key={id} />;
          })}
        </main>
      </div>
    </div>
  );
}
