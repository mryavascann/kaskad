import { act, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatters } from "@/i18n/format";
import { MotionProvider } from "@/motion/provider";
import { resetScrollIntent } from "@/motion/scroll";
import { mockMatchMedia } from "@/motion/test-utils";
import { blockAt } from "@/three/data";

const media = mockMatchMedia({ reduce: true });

const cueMock = vi.fn<(cue: string, volume?: number) => boolean>(() => true);
vi.mock("@/audio/use-cue", () => ({ useCue: () => cueMock }));
vi.mock("@/three/hero-stage", () => ({ HeroStage: () => <div data-testid="hero-stage" /> }));

const { ShockScene, replayAt, waveCue } = await import("./shock-scene");
const { useWaveCues, BOOM_GAP_MS } = await import("./shock-live");
const { blockAtProgress, sceneBlock, sceneProgress, resetSceneState } = await import("./scene-state");
const { recordedLanding } = await import("./__fixtures__/landing-data");

const data = recordedLanding();
const f = data.finding!;
const p = data.positions!;
const en = formatters("en");
/** The lazy islands' first load can take a while in a busy test run. */
const LAZY = { timeout: 10_000 };

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

afterEach(() => {
  vi.restoreAllMocks();
  media.set({ reduce: false });
  resetSceneState();
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

describe("blockAtProgress", () => {
  it("is the whole block of three/data's blockAt", () => {
    const tl = p.hero.timeline;
    for (let i = 0; i <= 200; i++) {
      const x = i / 200;
      expect(blockAtProgress(tl, x)).toBe(Math.floor(blockAt(tl, x) + 1e-9));
    }
    expect(blockAtProgress(tl, -1)).toBe(blockAtProgress(tl, 0));
    expect(blockAtProgress(tl, 2)).toBe(f.steps);
  });
});

describe("ShockScene under reduced motion", () => {
  it("shows the complete final state statically", async () => {
    media.set({ reduce: true });
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
    expect(await within(panel).findByText(`Wave ${f.waves.length}`, {}, LAZY)).toBeInTheDocument();
    const strip = document.querySelector<HTMLElement>("dl[aria-label='Replay of the live preview']")!;
    expect(await within(strip).findByText(`${f.steps}/${f.steps}`, {}, LAZY)).toBeInTheDocument();
    expect(within(strip).getByText(`${p.belowThreshold + p.counts.liquidated}/${p.total}`)).toBeInTheDocument();
    expect(within(strip).getByText(en.usd(f.clearedUsd))).toBeInTheDocument();
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
  });
});

describe("ShockScene driven by scroll", () => {
  /** A 3,000 px track; `scrollY` positions the window over it (jsdom has no layout). */
  function layout(scrollY: number) {
    Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: -window.scrollY, bottom: 3000 - window.scrollY, left: 0, right: 800, width: 800, height: 3000, x: 0, y: -window.scrollY, toJSON() {} }) as DOMRect,
    );
  }

  it("does nothing before the reader's first intent, then follows the scroll without re-rendering the scene", async () => {
    resetScrollIntent();
    layout(0);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    render(
      <MotionProvider>
        <ShockScene locale="en" finding={f} positions={p} placeholderCount={p.total} intro={<h1>Headline</h1>} />
      </MotionProvider>,
    );
    await flush();
    const track = document.querySelector<HTMLElement>("[data-landing-shock]")!;
    const panel = track.querySelector<HTMLElement>("[data-landing-panel]")!;
    // Server state: headline in, panel hidden from assistive tech and the tab order, no variables set.
    expect(track.style.getPropertyValue("--intro")).toBe("");
    expect(panel).toHaveAttribute("inert");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(sceneBlock.get()).toBeNull();

    // First scroll: the gate opens and the driver measures the track (3,000 − 768 px of travel).
    const travel = 3000 - window.innerHeight;
    layout(Math.round(travel * 0.5));
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(sceneProgress.get()).toBeCloseTo(0.5, 2);
    expect(track.style.getPropertyValue("--intro")).toBe("0.0000");
    expect(track.style.getPropertyValue("--panel")).toBe("1.0000");
    expect(track).toHaveAttribute("data-intro-gone");
    expect(panel).not.toHaveAttribute("inert");
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(sceneBlock.get()).toBe(blockAtProgress(p.hero.timeline, sceneProgress.get()));

    // Back to the top: the panel leaves the tab order again.
    layout(0);
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(track.style.getPropertyValue("--intro")).toBe("1.0000");
    expect(track).not.toHaveAttribute("data-intro-gone");
    expect(panel).toHaveAttribute("inert");
    raf.mockRestore();
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
