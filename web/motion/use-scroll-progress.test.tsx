import { act, render } from "@testing-library/react";
import type { MotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia();

const observed: { el: Element; range: unknown; onChange: (p: number) => void }[] = [];
const stop = vi.fn();
vi.mock("./scroll", async (orig) => ({
  ...(await orig<typeof import("./scroll")>()),
  observeScrollProgress: (el: Element, range: unknown, onChange: (p: number) => void) => {
    observed.push({ el, range, onChange });
    onChange(0.25);
    return stop;
  },
}));

const { useScrollProgress } = await import("./use-scroll-progress");
const { MotionProvider } = await import("./provider");

const probe: { value: MotionValue<number> | null } = { value: null };

function Probe({ when }: { when?: () => Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref, { start: "top top", end: "bottom bottom", when });
  useEffect(() => {
    probe.value = progress;
  }, [progress]);
  return <div ref={ref} data-testid="track" />;
}

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  observed.length = 0;
  stop.mockReset();
  probe.value = null;
});

afterEach(() => media.set({ reduce: false }));

describe("useScrollProgress", () => {
  it("observes the element after hydration and follows its progress", async () => {
    const { unmount, getByTestId } = render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    await flush();
    expect(observed).toHaveLength(1);
    expect(observed[0].el).toBe(getByTestId("track"));
    expect(observed[0].range).toEqual({ start: "top top", end: "bottom bottom" });
    expect(probe.value?.get()).toBe(0.25);
    act(() => observed[0].onChange(0.6));
    expect(probe.value?.get()).toBe(0.6);
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("waits for `when` before observing", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const when = () => gate;
    render(
      <MotionProvider>
        <Probe when={when} />
      </MotionProvider>,
    );
    await flush();
    expect(observed).toHaveLength(0);
    expect(probe.value?.get()).toBe(0);
    open();
    await flush();
    expect(observed).toHaveLength(1);
  });

  it("jumps to the final state and observes nothing under reduced motion", async () => {
    media.set({ reduce: true });
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>,
    );
    await flush();
    expect(observed).toHaveLength(0);
    expect(probe.value?.get()).toBe(1);
  });
});
