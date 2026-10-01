import { render, screen } from "@testing-library/react";
import { Wallet } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Callout } from "./callout";

describe("Callout", () => {
  it("interrupts (role=alert) for liquidation-tone errors", () => {
    const { container } = render(
      <Callout tone="liq" title="RPC unreachable">
        The Monad testnet RPC did not answer.
      </Callout>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("RPC unreachable");
    expect(alert).toHaveTextContent("The Monad testnet RPC did not answer.");
    expect(container.querySelector("svg.lucide-octagon-alert")).toHaveAttribute("aria-hidden", "true");
  });

  it("is a polite status for the other tones", () => {
    const { container } = render(<Callout tone="warn" title="Worst-case oracle mode" />);
    expect(screen.getByRole("status")).toHaveTextContent("Worst-case oracle mode");
    expect(container.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets live override the role, including off for static notes", () => {
    const { rerender } = render(<Callout tone="warn" live="assertive" title="Funding" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<Callout tone="liq" live="off" title="Funding" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders an action and a custom icon", () => {
    const { container } = render(<Callout tone="liq" title="Burner could not be funded" icon={Wallet} action={<button type="button">Retry</button>} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-wallet")).not.toBeNull();
  });

  it("tints the surface with the tone", () => {
    render(<Callout tone="safe" title="Confirmed" />);
    expect(screen.getByRole("status")).toHaveClass("bg-safe/8", "border-safe/35");
  });
});
