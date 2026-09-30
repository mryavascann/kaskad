import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { positionsOf, vizRun } from "./__fixtures__/data";
import { dropAt } from "./positions";
import { PositionRings } from "./position-rings";

const sali = vizRun("sali");

const dots = (c: HTMLElement) => [...c.querySelectorAll<SVGCircleElement>("circle[data-state]")];

describe("PositionRings", () => {
  it("summarises rings, shock and outcomes for screen readers", () => {
    render(<PositionRings classification={sali.positions} shock={sali.shock} prices={sali.prices} steps={20} />);
    const drop = dropAt({ prices: sali.prices }) ?? 0;
    const inside = positionsOf(sali).filter((p) => p.thresholdDrop !== null && p.thresholdDrop <= drop).length;
    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(name).toContain(`The shock ring is at −3.0%; ${inside} positions are inside it.`);
    expect(name).toContain("30 stuck below the liquidation threshold");
    expect(screen.getByRole("figure", { name: "Positions by distance to liquidation" })).toBeInTheDocument();
  });

  it("draws one dot per position with rounded coordinates", () => {
    const { container } = render(<PositionRings classification={sali.positions} shock={sali.shock} table={false} />);
    const all = dots(container);
    expect(all).toHaveLength(57);
    for (const d of all) for (const a of ["cx", "cy", "r"]) expect((d.getAttribute(a)?.split(".")[1] ?? "").length).toBeLessThanOrEqual(2);
    expect(all.filter((d) => d.getAttribute("data-state") === "stuck")).toHaveLength(30);
  });

  it("flips dots with the replay step", () => {
    const { container, rerender } = render(<PositionRings classification={sali.positions} shock={sali.shock} step={0} steps={20} prices={sali.prices} table={false} />);
    expect(dots(container).every((d) => d.getAttribute("data-state") === "pending")).toBe(true);
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    rerender(<PositionRings classification={sali.positions} shock={sali.shock} step={7} steps={20} prices={sali.prices} table={false} />);
    expect(dots(container).filter((d) => d.getAttribute("data-state") === "liquidated")).toHaveLength(1);
  });

  it("labels the rings, the shock and the outer band", () => {
    render(<PositionRings classification={sali.positions} shock={sali.shock} table={false} />);
    for (const label of ["1%", "2%", "5%", "10%"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("Shock −3.0%")).toBeInTheDocument();
    expect(screen.getByText("Beyond 10%")).toBeInTheDocument();
  });

  it("shows a skeleton of the same square box while loading", () => {
    const { container } = render(<PositionRings classification={null} shock={null} />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.className).toContain("aspect-square");
  });
});
