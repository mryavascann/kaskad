import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Divider } from "./divider";

describe("Divider", () => {
  it("is a separator without a label", () => {
    render(<Divider />);
    expect(screen.getByRole("separator")).not.toHaveAttribute("aria-orientation");
  });

  it("can stand vertically", () => {
    render(<Divider orientation="vertical" />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  });

  it("reads its label as text, with the rules hidden", () => {
    const { container } = render(<Divider label="Source · Monad mainnet" />);
    expect(screen.getByText("Source · Monad mainnet")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).toBeNull();
    const rules = container.querySelectorAll("[aria-hidden]");
    expect(rules).toHaveLength(2);
  });

  it("puts the label at the start with align=start", () => {
    const { container } = render(<Divider label="Readout" align="start" />);
    const root = container.firstElementChild!;
    expect(root.firstElementChild).toHaveTextContent("Readout");
    expect(root.querySelectorAll("[aria-hidden]")).toHaveLength(1);
  });

  it("adds ruler ticks on request", () => {
    const { container, rerender } = render(<Divider />);
    expect(container.querySelector("[data-slot='divider-ticks']")).toBeNull();
    rerender(<Divider ticks />);
    expect(container.querySelector("[data-slot='divider-ticks']")).not.toBeNull();
    rerender(<Divider ticks label="Readout" align="start" />);
    expect(container.querySelector("[data-slot='divider-ticks']")).not.toBeNull();
  });
});
