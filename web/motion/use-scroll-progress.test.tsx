import { act, render } from "@testing-library/react";
import type { MotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia();

type TriggerVars = { trigger: Element; start: string; end: string; onUpdate: (self: { progress: number }) => void };
const created: TriggerVars[] = [];
const kill = vi.fn();
const registerPlugin = vi.fn();

vi.mock("gsap", () => ({ gsap: { registerPlugin } }));
vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    create: (vars: TriggerVars) => {
      created.push(vars);
      return { progress: 0.25, kill };
    },
  },
}));

const { useScrollProgress } = await import("./use-scroll-progress");
const { MotionProvider } = await import("./provider");
const { resetScrollKit } = await import("./scroll");

const probe: { value: MotionValue<number> | null } = { value: null };

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref, { start: "top top", end: "bottom bottom" });
  useEffect(() => {
    probe.value = progress;
  }, [progress]);
  return <div ref={ref} data-testid="track" />;
}

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  created.length = 0;
  kill.mockReset();
  probe.value = null;
  resetScrollKit();
});

afterEach(() => media.set({ reduce: false }));

describe("useScrollProgress", () => {
  it("creates a ScrollTrigger on the element after hydration and follows its progress", async () => {
    const { unmount, getByTestId } = render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    expect(probe.value?.get()).toBe(0);
    await flush();
    expect(created).toHaveLength(1);
    expect(created[0].trigger).toBe(getByTestId("track"));
    expect(created[0].start).toBe("top top");
    expect(probe.value?.get()).toBe(0.25);
    act(() => created[0].onUpdate({ progress: 0.6 }));
    expect(probe.value?.get()).toBe(0.6);
    unmount();
    expect(kill).toHaveBeenCalled();
  });

  it("jumps to the final state and loads nothing under reduced motion", async () => {
    media.set({ reduce: true });
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    await flush();
    expect(created).toHaveLength(0);
    expect(probe.value?.get()).toBe(1);
  });
});
