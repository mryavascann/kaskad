import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HONESTY, HONESTY_KINDS, HonestyTag } from "./honesty";

describe("HonestyTag", () => {
  it("renders the default label of every kind with a distinct, hidden icon", () => {
    const icons = new Set<string>();
    for (const kind of HONESTY_KINDS) {
      const { container, unmount } = render(<HonestyTag kind={kind} />);
      expect(screen.getByText(HONESTY[kind].label)).toBeInTheDocument();
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("aria-hidden", "true");
      icons.add(svg.getAttribute("class")!);
      unmount();
    }
    expect(icons.size).toBe(HONESTY_KINDS.length);
  });

  it("lets children override the label", () => {
    render(<HonestyTag kind="real">Real book · Monad Aave · 255 borrowers</HonestyTag>);
    expect(screen.getByText("Real book · Monad Aave · 255 borrowers")).toBeInTheDocument();
    expect(screen.queryByText("Real book")).toBeNull();
  });

  it("draws soft sources (assumed, estimated, synthetic) dashed and hard ones solid", () => {
    const { container, rerender } = render(<HonestyTag kind="assumption" />);
    expect(container.firstElementChild).toHaveClass("border-dashed");
    rerender(<HonestyTag kind="measured" />);
    expect(container.firstElementChild).not.toHaveClass("border-dashed");
    expect(container.firstElementChild).toHaveAttribute("data-kind", "measured");
  });
});
