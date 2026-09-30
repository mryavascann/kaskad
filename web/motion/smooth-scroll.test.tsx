import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia();

const lenisInstances: { opts: unknown; destroy: ReturnType<typeof vi.fn> }[] = [];
const tickerAdd = vi.fn();
const tickerRemove = vi.fn();

vi.mock("lenis", () => ({
  default: class {
    destroy = vi.fn();
    constructor(opts: unknown) {
      lenisInstances.push({ opts, destroy: this.destroy });
    }
    on() {}
    off() {}
    raf() {}
  },
}));
vi.mock("gsap", () => ({ gsap: { registerPlugin: vi.fn(), ticker: { add: tickerAdd, remove: tickerRemove, lagSmoothing: vi.fn() } } }));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: { update: vi.fn() } }));

const { SmoothScroll } = await import("./smooth-scroll");
const { MotionProvider } = await import("./provider");
const { resetScrollKit } = await import("./scroll");

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  lenisInstances.length = 0;
  tickerAdd.mockReset();
  tickerRemove.mockReset();
  resetScrollKit();
});

afterEach(() => media.set({ reduce: false }));

describe("SmoothScroll", () => {
  it("starts Lenis on the GSAP ticker after hydration and destroys it on unmount", async () => {
    const { unmount } = render(
      <MotionProvider>
        <SmoothScroll />
      </MotionProvider>,
    );
    await flush();
    expect(lenisInstances).toHaveLength(1);
    expect(tickerAdd).toHaveBeenCalledTimes(1);
    unmount();
    expect(lenisInstances[0].destroy).toHaveBeenCalled();
    expect(tickerRemove).toHaveBeenCalled();
  });

  it("stays off under reduced motion", async () => {
    media.set({ reduce: true });
    render(
      <MotionProvider>
        <SmoothScroll />
      </MotionProvider>,
    );
    await flush();
    expect(lenisInstances).toHaveLength(0);
  });
});
