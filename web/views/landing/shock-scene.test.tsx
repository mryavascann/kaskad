import { act, render, renderHook, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatters } from "@/i18n/format";
import { MotionProvider } from "@/motion/provider";
import { mockMatchMedia } from "@/motion/test-utils";

const media = mockMatchMedia({ reduce: true });

const cueMock = vi.fn<(cue: string, volume?: number) => boolean>(() => true);
vi.mock("@/audio/use-cue", () => ({ useCue: () => cueMock }));
vi.mock("@/three/hero-stage", () => ({ HeroStage: () => <div data-testid="hero-stage" /> }));
vi.mock("@/motion/scroll", async (orig) => ({ ...(await orig<typeof import("@/motion/scroll")>()), loadScrollKit: () => new Promise(() => {}) }));

const { ShockScene, replayAt, waveCue, useWaveCues, BOOM_GAP_MS } = await import("./shock-scene");
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

describe("wave cues", () => {
  const first = f.waves[0].step;
  const second = f.waves.find((w) => w.step > first)?.step;

  it("booms at the first liquidation block, ticks as the counter advances, stays quiet going back", () => {
    expect(waveCue(f, first - 1, first)).toBe("boom");
    expect(waveCue(f, 0, f.steps)).toBe("boom");
    expect(waveCue(f, first - 2, first - 1)).toBeNull();
    if (second !== undefined) expect(waveCue(f, second - 1, second)).toBe("tick");
    expect(waveCue(f, first, first - 1)).toBeNull();
    expect(waveCue(f, f.steps, f.steps)).toBeNull();
  });

  it("plays on scroll after the page settles, and debounces the boom when scrolling back and forth", () => {
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    cueMock.mockClear();
    const { rerender } = renderHook(({ block }) => useWaveCues(f, block), { initialProps: { block: 0 } });
    // A restored scroll position right after mount stays silent.
    rerender({ block: first });
    expect(cueMock).not.toHaveBeenCalled();
    rerender({ block: 0 });

    now = 2000;
    rerender({ block: first });
    expect(cueMock).toHaveBeenLastCalledWith("boom");
    rerender({ block: first - 1 });
    now = 3000;
    rerender({ block: first });
    expect(cueMock).toHaveBeenLastCalledWith("tick");
    expect(cueMock.mock.calls.filter(([c]) => c === "boom")).toHaveLength(1);

    rerender({ block: first - 1 });
    now = 2000 + BOOM_GAP_MS + 1;
    rerender({ block: first });
    expect(cueMock.mock.calls.filter(([c]) => c === "boom")).toHaveLength(2);
    clock.mockRestore();
  });

  it("stays silent when disabled (reduced motion)", () => {
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    cueMock.mockClear();
    const { rerender } = renderHook(({ block }) => useWaveCues(f, block, false), { initialProps: { block: 0 } });
    now = 5000;
    rerender({ block: f.steps });
    expect(cueMock).not.toHaveBeenCalled();
    clock.mockRestore();
  });
});
