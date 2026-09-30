/** The browser half of ./scroll.ts (jsdom): the progress observer and the intent gate. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeScrollProgress, openScrollIntent, resetScrollIntent, whenScrollIntent } from "./scroll";

describe("observeScrollProgress", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports the progress now and once per frame on scroll, from offsets measured once", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    const rect = vi.fn(() => ({ top: 500 - window.scrollY, height: 2000 + window.innerHeight }) as DOMRect);
    const el = document.createElement("div");
    el.getBoundingClientRect = rect;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    const seen: number[] = [];
    const stop = observeScrollProgress(el, { start: "top top", end: "bottom bottom" }, (p) => seen.push(p));
    expect(seen).toEqual([0]);

    Object.defineProperty(window, "scrollY", { configurable: true, value: 1500 });
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(seen).toEqual([0, 0.5]);
    expect(rect).toHaveBeenCalledTimes(1);

    stop();
    window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
  });
});

describe("whenScrollIntent", () => {
  beforeEach(() => {
    resetScrollIntent();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  const settled = async (p: Promise<void>) => {
    let done = false;
    void p.then(() => (done = true));
    await new Promise((r) => setTimeout(r, 0));
    return done;
  };

  it("waits for the first scroll, wheel, touch, press or key", async () => {
    for (const type of ["scroll", "wheel", "touchstart", "pointerdown", "keydown"]) {
      resetScrollIntent();
      const gate = whenScrollIntent();
      expect(await settled(gate)).toBe(false);
      window.dispatchEvent(new Event(type));
      expect(await settled(gate)).toBe(true);
    }
  });

  it("counts a mouse move, not a touch move", async () => {
    const gate = whenScrollIntent();
    const move = (pointerType: string) => {
      const e = new Event("pointermove");
      Object.defineProperty(e, "pointerType", { value: pointerType });
      window.dispatchEvent(e);
    };
    move("touch");
    expect(await settled(gate)).toBe(false);
    move("mouse");
    expect(await settled(gate)).toBe(true);
  });

  it("opens at once when the page is already scrolled, or on request", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    expect(await settled(whenScrollIntent())).toBe(true);
    resetScrollIntent();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    const gate = whenScrollIntent();
    openScrollIntent();
    expect(await settled(gate)).toBe(true);
  });
});
