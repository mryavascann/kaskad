import { describe, expect, it, vi } from "vitest";

const animate = vi.fn(() => ({ stop: vi.fn() }));
vi.mock("./animate-impl", () => ({ animate }));

const { loadAnimate, withAnimate } = await import("./animate");

describe("lazy animate", () => {
  it("starts once animate loads; a stop before that cancels the start", async () => {
    const cancelled = withAnimate((a) => a(0 as never, 1 as never));
    cancelled.stop();
    const started = withAnimate((a) => [a(0 as never, 2 as never), null]);
    expect(animate).not.toHaveBeenCalled(); // not loaded yet: nothing runs synchronously
    await loadAnimate();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(0, 2);
    started.stop();
    expect(animate.mock.results[0].value.stop).toHaveBeenCalled();
  });

  it("starts synchronously once loaded", () => {
    animate.mockClear();
    withAnimate((a) => a(0 as never, 3 as never));
    expect(animate).toHaveBeenCalledWith(0, 3);
  });
});
