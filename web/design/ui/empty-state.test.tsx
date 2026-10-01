import { render, screen } from "@testing-library/react";
import { Waves } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("names the empty result with a heading, a reason and the next step", () => {
    const { container } = render(
      <EmptyState
        icon={Waves}
        title="No liquidations at this shock"
        body="Every position stays above its liquidation threshold."
        action={<button type="button">Deepen the shock</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "No liquidations at this shock" })).toBeInTheDocument();
    expect(screen.getByText("Every position stays above its liquidation threshold.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deepen the shock" })).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-waves")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses a default icon and a configurable title element", () => {
    const { container } = render(<EmptyState title="Nothing yet" titleAs="p" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Nothing yet").tagName).toBe("P");
    expect(container.querySelector("svg.lucide-inbox")).not.toBeNull();
  });

  it("has a compact one-row variant", () => {
    const { container } = render(<EmptyState compact title="No liquidations at this shock" body="All positions stay above their threshold." />);
    expect(container.firstElementChild).toHaveAttribute("data-compact");
    expect(screen.getByRole("heading", { name: "No liquidations at this shock" })).toHaveClass("text-body-sm");
  });
});
