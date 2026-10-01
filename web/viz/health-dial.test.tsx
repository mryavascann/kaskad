import { render, screen } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { describe, expect, it } from "vitest";
import { positionsOf, vizRun } from "./__fixtures__/data";
import { hfAngle } from "./gauge-model";
import { HealthDial } from "./health-dial";

const positions = positionsOf(vizRun("sali"));
const largest = positions.reduce((a, p) => (p.debtUsd > a.debtUsd ? p : a));
const needle = (c: HTMLElement) => c.querySelector('[data-slot="needle"]');

describe("HealthDial", () => {
  it("reads a recorded position: value, zone word and icon, needle at the value", () => {
    const { container } = render(<HealthDial value={largest.healthFactor} caption="Position #0" />);
    expect(screen.getByText(largest.healthFactor.toFixed(3))).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Health factor" })).toHaveAttribute("data-zone", "warning");
    expect(needle(container)).toHaveAttribute("transform", `rotate(${hfAngle(largest.healthFactor)} 120 122)`);
    expect(screen.getByText("Position #0")).toBeInTheDocument();
    expect(screen.getByText(/Liquidatable under 1, warning under 1\.05\./)).toBeInTheDocument();
  });

  it("names every zone in words", () => {
    const { rerender } = render(<HealthDial value={0.993} />);
    expect(screen.getByText("Liquidatable")).toBeInTheDocument();
    rerender(<HealthDial value={1.84} />);
    expect(screen.getByText("Safe")).toBeInTheDocument();
  });

  it("shows 'no debt' for an infinite health factor, without a needle", () => {
    const { container } = render(<HealthDial value={Infinity} />);
    expect(screen.getByText("No debt")).toBeInTheDocument();
    expect(needle(container)).toBeNull();
  });

  it("shows a skeleton while the value is missing", () => {
    const { container } = render(<HealthDial value={null} />);
    expect(screen.getByRole("figure")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading the health factor")).toBeInTheDocument();
    expect(needle(container)).toBeNull();
  });

  it("retargets the needle to a new value (jumps under reduced motion)", () => {
    const after = largest.finalHealthFactor ?? 0;
    const { container, rerender } = render(
      <MotionConfig reducedMotion="always">
        <HealthDial value={largest.healthFactor} />
      </MotionConfig>,
    );
    rerender(
      <MotionConfig reducedMotion="always">
        <HealthDial value={after} />
      </MotionConfig>,
    );
    expect(needle(container)).toHaveAttribute("transform", `rotate(${hfAngle(after)} 120 122)`);
    expect(screen.getByText("Liquidatable")).toBeInTheDocument();
  });

  it("takes formatters and copy from props", () => {
    render(<HealthDial value={1.5} formatHf={(v) => v.toFixed(2).replace(".", ",")} copy={{ safe: "Güvende" }} />);
    expect(screen.getByText("1,50")).toBeInTheDocument();
    expect(screen.getByText("Güvende")).toBeInTheDocument();
  });
});
