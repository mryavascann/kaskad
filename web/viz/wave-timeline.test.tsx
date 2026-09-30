import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { vizRun } from "./__fixtures__/data";
import { vizFormats } from "./format";
import { WaveTimeline } from "./wave-timeline";

const sali = vizRun("sali");
const worst = vizRun("worst");
const f = vizFormats();

function Scrubbed({ onChange }: { onChange?: (step: number) => void }) {
  const [step, setStep] = useState(20);
  return (
    <WaveTimeline
      timeline={sali.timeline}
      step={step}
      onStepChange={(s) => {
        setStep(s);
        onChange?.(s);
      }}
    />
  );
}

const decimals = (v: string) => (v.split(".")[1] ?? "").length;

describe("WaveTimeline", () => {
  it("describes the recorded run in one summary (role img)", () => {
    render(<WaveTimeline timeline={sali.timeline} />);
    const img = screen.getByRole("img");
    const name = img.getAttribute("aria-label") ?? "";
    expect(name).toContain("Cascade over 20 blocks.");
    expect(name).toContain(`Oracle price ${f.price(sali.prices[0])} to ${f.price(sali.prices[20])} (−3.0%).`);
    expect(name).toContain("Liquidations: 1. Waves: 1.");
    expect(name).toContain("First liquidation in block 7.");
    expect(name).toContain("Liquidations stopped at block 7: no profitable sale left in the pool.");
    expect(screen.getByRole("figure", { name: "Cascade timeline" })).toBeInTheDocument();
  });

  it("marks the first liquidation and explains the stall in visible text", () => {
    render(<WaveTimeline timeline={sali.timeline} />);
    expect(screen.getByText("Block 7 · first liquidation")).toBeInTheDocument();
    expect(screen.getByText("Liquidations stopped at block 7: no profitable sale left in the pool")).toBeInTheDocument();
    expect(screen.getByText("Stalled")).toBeInTheDocument();
  });

  it("draws one bar per block with liquidations and keeps geometry rounded", () => {
    const { container } = render(<WaveTimeline timeline={worst.timeline} />);
    const bars = container.querySelectorAll("rect[data-step]");
    expect(bars).toHaveLength(worst.timeline.points.filter((p) => p.liquidations > 0).length);
    for (const bar of bars) for (const attr of ["x", "y", "width", "height"]) expect(decimals(bar.getAttribute(attr) ?? "")).toBeLessThanOrEqual(2);
  });

  it("has a data table with one row per block", () => {
    render(<WaveTimeline timeline={sali.timeline} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(22);
    expect(within(table).getByRole("columnheader", { name: "Liquidated" })).toBeInTheDocument();
    expect(within(table).getAllByText(f.usd(sali.timeline.points[7].liquidated)).length).toBeGreaterThan(0);
  });

  it("is a keyboard scrubber: a named slider with value text that moves the playhead", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Scrubbed onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Block" });
    expect(slider).toHaveAttribute("aria-valuetext", `Block 20 of 20: oracle price ${f.price(sali.prices[20])}, liquidated $0, waves 0`);
    expect(container.querySelector('[data-slot="playhead"]')).not.toBeNull();

    slider.focus();
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(0);
    for (let i = 0; i < 7; i++) await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(7);
    expect(slider).toHaveAttribute("aria-valuetext", `Block 7 of 20: oracle price ${f.price(sali.prices[7])}, liquidated $133.9K, waves 1`);
    // The readout above the plot follows the playhead: this block, and everything up to it.
    expect(screen.getByText("7 / 20")).toBeInTheDocument();
    expect(screen.getByText("In this block")).toBeInTheDocument();
    expect(screen.getByText("Liquidated so far")).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByText("Liquidated so far").nextSibling).toHaveTextContent("$133.9K");
    expect(screen.getByText("In this block").nextSibling).toHaveTextContent("$0");
  });

  it("has no playhead or scrubber without a step", () => {
    const { container } = render(<WaveTimeline timeline={sali.timeline} />);
    expect(container.querySelector('[data-slot="playhead"]')).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("takes copy and formatters from props (e.g. Turkish)", () => {
    render(
      <WaveTimeline
        timeline={sali.timeline}
        locale="tr-TR"
        formatUsd={(v) => `USD ${Math.round(v)}`}
        copy={{ stalled: "Tasfiyeler {block}. blokta durdu", label: "Kaskad zaman çizelgesi", liquidatedKey: "Tasfiye" }}
      />,
    );
    expect(screen.getByText("Tasfiyeler 7. blokta durdu")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Kaskad zaman çizelgesi" })).toBeInTheDocument();
    expect(screen.getAllByText(`USD ${Math.round(sali.timeline.points[7].liquidated)}`).length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Tasfiye" })).toBeInTheDocument();
  });

  it("renders the trace variant bare: spikes, ticks, a summary, no table or readout", () => {
    const { container } = render(<WaveTimeline timeline={worst.timeline} variant="trace" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Cascade over 20 blocks.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Block 0")).toBeNull();
    expect(container.querySelectorAll("line[data-step]").length).toBeGreaterThan(1);
  });

  it("renders finished on the server by default; reveal starts closed; forced reduced motion is static", () => {
    const clip = (c: HTMLElement) => c.querySelector("clipPath rect") as SVGRectElement;
    const replay = render(<WaveTimeline timeline={sali.timeline} />);
    expect(clip(replay.container)).toHaveAttribute("transform", "scale(1 1)");
    expect(clip(replay.container)).not.toHaveAttribute("data-reveal");
    replay.unmount();

    const reveal = render(<WaveTimeline timeline={sali.timeline} entrance="reveal" />);
    expect(clip(reveal.container)).toHaveAttribute("transform", "scale(0 1)");
    expect(clip(reveal.container)).toHaveAttribute("data-reveal");
    reveal.unmount();

    const reduced = render(
      <MotionConfig reducedMotion="always">
        <WaveTimeline timeline={sali.timeline} entrance="reveal" />
      </MotionConfig>,
    );
    expect(clip(reduced.container)).toHaveAttribute("transform", "scale(1 1)");
  });

  it("shows loading, empty and error states in the chart's place", () => {
    const { rerender, container } = render(<WaveTimeline timeline={null} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText("Loading the cascade")).toBeInTheDocument();

    rerender(<WaveTimeline timeline={{ points: sali.timeline.points.slice(0, 1), stalled: false, lastActiveStep: 0 }} />);
    expect(screen.getByText("No blocks to show")).toBeInTheDocument();

    rerender(<WaveTimeline timeline={null} error="The preview reverted." />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Couldn't load the cascade");
    expect(status).toHaveTextContent("The preview reverted.");
  });
});
