import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TickRuler } from "./tick-ruler";

const segments = (d: string | null) => (d ?? "").split("M").filter(Boolean).length;

describe("TickRuler", () => {
  it("is decorative unless it has a label", () => {
    const { container, rerender } = render(<TickRuler count={21} major={4} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    rerender(<TickRuler count={21} major={4} label="Blocks 0 to 20" />);
    expect(screen.getByRole("img", { name: "Blocks 0 to 20" })).toBeInTheDocument();
  });

  it("draws one tick per step, every n-th one major", () => {
    const { container } = render(<TickRuler count={21} major={4} />);
    const [minor, major] = container.querySelectorAll("path");
    expect(segments(major.getAttribute("d"))).toBe(6); // 0 4 8 12 16 20
    expect(segments(minor.getAttribute("d"))).toBe(15);
  });

  it("stretches the SVG but keeps strokes at 1px", () => {
    const { container } = render(<TickRuler count={11} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    expect(svg).toHaveAttribute("viewBox", "0 0 10 100");
    for (const path of container.querySelectorAll("path")) expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
  });

  it("renders labels as HTML at the major ticks, edge labels anchored inside the ruler", () => {
    render(<TickRuler count={21} major={4} labels={["Block 0", "4", "8", "12", "16", "20"]} />);
    const first = screen.getByText("Block 0");
    const last = screen.getByText("20");
    expect(first.closest("svg")).toBeNull();
    expect(first.style.left).toBe("0%");
    expect(last.style.left).toBe("100%");
    expect(last.style.transform).toBe("translateX(-100%)");
    expect(screen.getByText("8").style.left).toBe("40%");
  });

  it("thins labels on narrow rulers (container queries) but always keeps the first and the last", () => {
    const { container } = render(<TickRuler count={21} major={4} labels={["Block 0", "4", "8", "12", "16", "20"]} />);
    expect(container.firstElementChild).toHaveClass("@container");
    const thinned = (text: string) => /@max-\[\d+rem\]:hidden/.test(screen.getByText(text).className);
    expect(thinned("Block 0")).toBe(false);
    expect(thinned("20")).toBe(false);
    for (const text of ["4", "8", "12", "16"]) expect(thinned(text), text).toBe(true);
  });

  it("calls a label function for major ticks only", () => {
    const label = vi.fn((i: number) => `−${i}%`);
    render(<TickRuler count={31} major={5} labels={label} />);
    expect(label.mock.calls.map(([i]) => i)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(screen.getByText("−15%")).toBeInTheDocument();
  });

  it("marks a highlighted index with a line and an optional label", () => {
    const { container } = render(<TickRuler count={21} major={4} highlight={{ index: 7, label: "Block 7" }} />);
    const line = container.querySelector<HTMLElement>("[data-slot='tick-ruler-highlight']")!;
    expect(line.style.left).toBe("35%");
    expect(line).toHaveClass("border-liq");
    expect(screen.getByText("Block 7")).toHaveClass("absolute");
  });

  it("accepts a bare index and a tone for the highlight", () => {
    const { container } = render(<TickRuler count={11} highlight={{ index: 5, tone: "warn" }} />);
    expect(container.querySelector("[data-slot='tick-ruler-highlight']")).toHaveClass("border-warn");
  });
});
