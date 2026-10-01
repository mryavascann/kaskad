import { act, render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockPulse } from "./block-pulse";

const head = (c: HTMLElement) => [...c.querySelectorAll("figure > div > span")].findIndex((s) => s.hasAttribute("data-head"));

describe("BlockPulse", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the first block with a skeleton", () => {
    render(<BlockPulse block={null} />);
    expect(screen.getByRole("figure", { name: "Monad blocks" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Waiting for the first block")).toBeInTheDocument();
  });

  it("shows the block and writes it into the strip (one cell per block)", () => {
    const { container } = render(<BlockPulse block={66_999_532n} />);
    expect(screen.getByText("66,999,532")).toBeInTheDocument();
    expect(container.querySelectorAll("figure > div > span")).toHaveLength(40);
    expect(head(container)).toBe(66_999_532 % 40);
  });

  it("replays blocks that arrive together at the pace observed between reads", () => {
    const { container, rerender } = render(<BlockPulse block={100n} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender(<BlockPulse block={105n} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    // 5 blocks in 2 s: one every 400 ms, starting from the block on screen.
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText(/\+5 since the last read · 0\.4 s per block \(observed\)/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(head(container)).toBe(101 % 40);
    act(() => {
      vi.advanceTimersByTime(1_600);
    });
    expect(screen.getByText("105")).toBeInTheDocument();
  });

  it("does not tick under reduced motion: the new count is shown at once", () => {
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <BlockPulse block={100n} />
      </MotionConfig>,
    );
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender(
      <MotionConfig reducedMotion="always">
        <BlockPulse block={105n} />
      </MotionConfig>,
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText("105")).toBeInTheDocument();
    expect(screen.getByText(/\+5 since the last read/)).toBeInTheDocument();
  });

  it("keeps the last block and says the feed is interrupted", () => {
    render(<BlockPulse block={42n} error="rate-limited" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Block feed interrupted")).toBeInTheDocument();
    expect(screen.getByText(/rate-limited/)).toBeInTheDocument();
  });
});
