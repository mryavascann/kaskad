import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockMatchMedia } from "./test-utils";

const media = mockMatchMedia();

const lenisInstances: { opts: unknown; destroy: ReturnType<typeof vi.fn> }[] = [];

vi.mock("lenis", () => ({
  default: class {
    destroy = vi.fn();
    constructor(opts: unknown) {
      lenisInstances.push({ opts, destroy: this.destroy });
    }
  },
}));

const { SmoothScroll } = await import("./smooth-scroll");
const { MotionProvider } = await import("./provider");
const { resetScrollIntent } = await import("./scroll");

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  lenisInstances.length = 0;
  resetScrollIntent();
});

afterEach(() => media.set({ reduce: false, fine: true }));

describe("SmoothScroll", () => {
  it("starts Lenis after the first intent (not at load) and destroys it on unmount", async () => {
    const { unmount } = render(
      <MotionProvider>
        <SmoothScroll />
      </MotionProvider>,
    );
    await flush();
    expect(lenisInstances).toHaveLength(0);
    await act(async () => {
      window.dispatchEvent(new Event("wheel"));
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(lenisInstances).toHaveLength(1);
    expect(lenisInstances[0].opts).toMatchObject({ autoRaf: true });
    unmount();
    expect(lenisInstances[0].destroy).toHaveBeenCalled();
  });

  it("stays off under reduced motion", async () => {
    media.set({ reduce: true });
    render(
      <MotionProvider>
        <SmoothScroll />
      </MotionProvider>,
    );
    window.dispatchEvent(new Event("wheel"));
    await flush();
    expect(lenisInstances).toHaveLength(0);
  });

  it("stays off without a fine pointer (touch screens scroll natively)", async () => {
    media.set({ fine: false });
    render(
      <MotionProvider>
        <SmoothScroll />
      </MotionProvider>,
    );
    window.dispatchEvent(new Event("touchstart"));
    await flush();
    expect(lenisInstances).toHaveLength(0);
  });
});
