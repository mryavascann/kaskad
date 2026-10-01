import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroPoster } from "./hero-poster";
import type { HeroPosition } from "./model";

const POSITIONS: HeroPosition[] = [
  { order: 0, debtUsd: 2e6, outcome: "stuck", tipAt: 0.05, hitAt: 0.05, thresholdAt: 0.02 },
  { order: 1, debtUsd: 5e5, outcome: "stuck", tipAt: 0.4, thresholdAt: 0.38 },
  { order: 2, debtUsd: 3e7, outcome: "bad-debt", tipAt: 0.6, thresholdAt: 0.58 },
  { order: 3, debtUsd: 4e6, outcome: "safe", thresholdAt: 1.3 },
  { order: 4, debtUsd: 1e4, outcome: "safe", thresholdAt: null },
];

describe("HeroPoster", () => {
  it("is decorative: hidden from assistive technology, no focusable SVG", () => {
    const { container } = render(<HeroPoster positions={POSITIONS} />);
    const stage = container.querySelector("[data-hero-poster]");
    expect(stage).toHaveAttribute("aria-hidden", "true");
    for (const svg of container.querySelectorAll("svg")) expect(svg).toHaveAttribute("focusable", "false");
  });

  it("draws a wide and a tall framing of the same row, one domino per position", () => {
    const { container } = render(<HeroPoster positions={POSITIONS} progress={1} />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg.querySelectorAll("[data-domino]")).toHaveLength(POSITIONS.length);
    expect(container.querySelector("[data-hero-poster]")).toHaveAttribute("data-state", "data");
  });

  it("draws the neutral loading row without data", () => {
    const { container } = render(<HeroPoster placeholderCount={12} />);
    expect(container.querySelector("[data-hero-poster]")).toHaveAttribute("data-state", "neutral");
    expect(container.querySelectorAll("svg")[0].querySelectorAll("[data-domino]")).toHaveLength(12);
  });

  it("renders the same markup every time (no hydration mismatch)", () => {
    const a = renderToStaticMarkup(<HeroPoster positions={POSITIONS} progress={0.47} />);
    const b = renderToStaticMarkup(<HeroPoster positions={POSITIONS} progress={0.47} />);
    expect(a).toBe(b);
    expect(a).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("shows outcomes only once they happen", () => {
    const start = renderToStaticMarkup(<HeroPoster positions={POSITIONS} progress={0} />);
    const end = renderToStaticMarkup(<HeroPoster positions={POSITIONS} progress={1} />);
    // Bad debt's red (liq) edge appears only after it tips.
    expect(start).not.toContain('stroke="#fc4447"');
    expect(end).toContain('stroke="#fc4447"');
  });

  it("keeps gradient ids unique when two posters share a page", () => {
    const { container } = render(
      <>
        <HeroPoster positions={POSITIONS} />
        <HeroPoster positions={POSITIONS} />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(20);
  });
});
