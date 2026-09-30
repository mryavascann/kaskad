import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatters } from "@/i18n/format";
import { MotionProvider } from "@/motion/provider";
import { mockMatchMedia } from "@/motion/test-utils";

const media = mockMatchMedia({ reduce: true });

vi.mock("@/three/hero-stage", () => ({ HeroStage: () => <div data-testid="hero-stage" /> }));
vi.mock("@/motion/scroll", async (orig) => ({ ...(await orig<typeof import("@/motion/scroll")>()), loadScrollKit: () => new Promise(() => {}) }));

const { ShockScene, replayAt } = await import("./shock-scene");
const { recordedLanding } = await import("./__fixtures__/landing-data");

const data = recordedLanding();
const f = data.finding!;
const p = data.positions!;
const en = formatters("en");

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

describe("replayAt", () => {
  it("replays only what the preview logged, block by block", () => {
    const first = f.waves[0];
    expect(replayAt(f, p, first.step - 1).waves).toHaveLength(0);
    expect(replayAt(f, p, first.step).latest?.n).toBe(1);
    const end = replayAt(f, p, f.steps);
    expect(end.waves).toHaveLength(f.waves.length);
    expect(end.liquidatedUsd).toBeCloseTo(f.clearedUsd, 2);
    expect(end.price).toBeCloseTo(f.finalPrice, 6);
    expect(end.stalled).toBe(true);
    expect(replayAt(f, p, 0).under).toBe(p.crossBlocks.filter((b) => b === 0).length);
  });
});

describe("ShockScene under reduced motion", () => {
  it("shows the complete final state statically", async () => {
    render(
      <MotionProvider>
        <ShockScene locale="en" finding={f} positions={p} placeholderCount={p.total} intro={<h1>Headline</h1>} />
      </MotionProvider>,
    );
    await flush();
    // The headline stays, the shock panel is available (not inert), the strip shows the last block.
    expect(screen.getByRole("heading", { level: 1, name: "Headline" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: `syrupUSDC −3%, over ${f.steps} blocks.` });
    expect(panel).not.toHaveAttribute("inert");
    expect(within(panel).getByText(`Wave ${f.waves.length}`)).toBeInTheDocument();
    const strip = document.querySelector<HTMLElement>("dl[aria-label='Replay of the live preview']")!;
    expect(within(strip).getByText(`${f.steps}/${f.steps}`)).toBeInTheDocument();
    expect(within(strip).getByText(`${p.belowThreshold + p.counts.liquidated}/${p.total}`)).toBeInTheDocument();
    expect(within(strip).getByText(en.usd(f.clearedUsd))).toBeInTheDocument();
    media.set({ reduce: false });
  });

  it("says what is missing when the preview could not be read", async () => {
    media.set({ reduce: true });
    render(
      <MotionProvider>
        <ShockScene locale="en" finding={null} positions={null} placeholderCount={57} intro={<h1>Headline</h1>} />
      </MotionProvider>,
    );
    await flush();
    expect(screen.getByText(/The live preview could not be read right now/)).toBeInTheDocument();
    media.set({ reduce: false });
  });
});
