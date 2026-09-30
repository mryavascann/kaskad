import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_POLL_MS, pollWhileVisible } from "./poll";

function fakeDoc(hidden = false) {
  const listeners = new Set<() => void>();
  return {
    hidden,
    addEventListener: vi.fn((_: string, l: () => void) => listeners.add(l)),
    removeEventListener: vi.fn((_: string, l: () => void) => listeners.delete(l)),
    set(h: boolean) {
      this.hidden = h;
      listeners.forEach((l) => l());
    },
    listeners,
  };
}

describe("pollWhileVisible", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ticks on the next task, then every period (legacy setTimeout 0 + setInterval)", async () => {
    const tick = vi.fn();
    const stop = pollWhileVisible(tick, 6_000, fakeDoc() as never);
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(tick).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it("pauses while hidden and resumes when visible again", async () => {
    const tick = vi.fn();
    const doc = fakeDoc(true);
    const stop = pollWhileVisible(tick, 3_000, doc as never);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).not.toHaveBeenCalled();
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    doc.set(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).toHaveBeenCalledTimes(1);
    doc.set(false); // data is 30 s old: refresh right away
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);
    doc.set(true);
    doc.set(false); // flipping back within one period does not tick early
    await vi.advanceTimersByTimeAsync(2_999);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    expect(doc.listeners.size).toBe(0);
  });

  it("never polls faster than once per second, and skips a tick while one is in flight", async () => {
    let release: () => void = () => {};
    const tick = vi.fn(() => new Promise<void>((r) => (release = r)));
    const stop = pollWhileVisible(tick, 10, fakeDoc() as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MIN_POLL_MS * 3); // still in flight: no pile-up
    expect(tick).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(MIN_POLL_MS);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });
});
