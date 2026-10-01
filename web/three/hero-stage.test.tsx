import { act, render, waitFor } from "@testing-library/react";
import { useEffect, useEffectEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockIntersectionObserver } from "@/motion/test-utils";
import type { HeroEnv } from "./capability";
import type { HeroSceneProps } from "./hero-scene";

const io = mockIntersectionObserver();
const env = vi.hoisted(() => ({ current: null as HeroEnv | null }));
const scene = vi.hoisted(() => ({ mounts: 0, lose: false }));

vi.mock("./capability", async (original) => ({
  ...(await original<typeof import("./capability")>()),
  readHeroEnv: () => env.current,
}));

// The real scene needs WebGL; this stand-in reports ready (or a lost context) like it does.
vi.mock("./hero-scene", () => ({
  HeroScene: ({ onReady, onContextLost }: HeroSceneProps) => {
    const firstFrame = useEffectEvent(() => (scene.lose ? onContextLost?.() : onReady?.()));
    useEffect(() => {
      scene.mounts++;
      firstFrame();
    }, []);
    return <div data-testid="scene" />;
  },
}));

const { HeroStage } = await import("./hero-stage");

const CAPABLE: HeroEnv = { reducedMotion: false, webgl2: true, softwareRenderer: false, cores: 8, memoryGb: 8, saveData: false };

function stageOf(container: HTMLElement) {
  const node = container.querySelector("[data-hero-stage]");
  if (!node) throw new Error("no stage");
  return node;
}

beforeEach(() => {
  env.current = CAPABLE;
  scene.mounts = 0;
  scene.lose = false;
});

describe("HeroStage", () => {
  it("renders the poster first, before any client decision (server and hydration)", () => {
    const { container } = render(<HeroStage className="h-96" />);
    const stage = stageOf(container);
    expect(stage).toHaveAttribute("aria-hidden", "true");
    expect(stage).toHaveAttribute("data-mode", "pending");
    expect(container.querySelector("[data-hero-poster]")).toBeInTheDocument();
    expect(container.querySelector("[data-testid=scene]")).toBeNull();
  });

  it("loads the scene on a capable device once it is near the viewport, then drops the poster", async () => {
    const onModeChange = vi.fn();
    const onReady = vi.fn();
    const { container } = render(<HeroStage onModeChange={onModeChange} onReady={onReady} />);
    await waitFor(() => expect(stageOf(container)).toHaveAttribute("data-mode", "scene"));
    expect(onModeChange).toHaveBeenCalledWith({ mode: "scene", reason: "capable" });
    expect(container.querySelector("[data-testid=scene]")).toBeNull();

    act(() => io.intersect());
    await waitFor(() => expect(container.querySelector("[data-testid=scene]")).toBeInTheDocument());
    await waitFor(() => expect(stageOf(container)).toHaveAttribute("data-ready"));
    expect(onReady).toHaveBeenCalledTimes(1);

    // The canvas layer fades in; when the fade ends the placeholder poster goes.
    const layer = container.querySelector("[data-testid=scene]")?.closest(".transition-opacity");
    expect(layer).toHaveClass("opacity-100");
    act(() => layer?.dispatchEvent(new Event("transitionend", { bubbles: true })));
    expect(container.querySelector("[data-hero-poster]")).toBeNull();
  });

  it("on a touch-first screen, waits for the first interaction before loading the scene", async () => {
    env.current = { ...CAPABLE, touchFirst: true };
    const { container } = render(<HeroStage />);
    await waitFor(() => expect(stageOf(container)).toHaveAttribute("data-defer", "interaction"));
    act(() => io.intersect());
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(scene.mounts).toBe(0);

    act(() => void window.dispatchEvent(new Event("touchstart")));
    await waitFor(() => expect(scene.mounts).toBe(1));
    expect(stageOf(container)).not.toHaveAttribute("data-defer");
  });

  it.each([
    [{ reducedMotion: true }, "reduced-motion"],
    [{ webgl2: false }, "no-webgl"],
    [{ softwareRenderer: true }, "software-renderer"],
    [{ cores: 2 }, "low-cpu"],
    [{ saveData: true }, "save-data"],
  ] as const)("keeps the poster, at the final state, for %o", async (patch, reason) => {
    env.current = { ...CAPABLE, ...patch };
    const { container } = render(<HeroStage positions={[{ order: 0, debtUsd: 1, outcome: "stuck", tipAt: 0.1 }]} />);
    await waitFor(() => expect(stageOf(container)).toHaveAttribute("data-reason", reason));
    expect(stageOf(container)).toHaveAttribute("data-mode", "poster");
    act(() => io.intersect());
    // The final frame fades in over the placeholder (the placeholder showed progress 0).
    expect(container.querySelectorAll("[data-hero-poster]")).toHaveLength(2);
    expect(container.querySelector(".animate-fade-in [data-hero-poster]")).toBeInTheDocument();
    expect(scene.mounts).toBe(0);
  });

  it("honours a forced poster", async () => {
    const { container } = render(<HeroStage mode="poster" />);
    await waitFor(() => expect(stageOf(container)).toHaveAttribute("data-reason", "forced-poster"));
    act(() => io.intersect());
    expect(scene.mounts).toBe(0);
  });

  it("falls back to the poster when the scene loses its WebGL context", async () => {
    scene.lose = true;
    const { container } = render(<HeroStage />);
    act(() => io.intersect());
    await waitFor(() => expect(scene.mounts).toBe(1));
    await waitFor(() => expect(stageOf(container)).toHaveAttribute("data-reason", "scene-failed"));
    expect(container.querySelector("[data-testid=scene]")).toBeNull();
    expect(container.querySelector("[data-hero-poster]")).toBeInTheDocument();
  });
});
