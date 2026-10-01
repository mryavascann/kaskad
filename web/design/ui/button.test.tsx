import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonArrow } from "./button";

describe("Button", () => {
  it("renders a type=button by default so it never submits a form by accident", () => {
    render(<Button>Run the stress test</Button>);
    expect(screen.getByRole("button", { name: "Run the stress test" })).toHaveAttribute("type", "button");
  });

  it("calls onClick when activated with mouse or keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Prove on-chain</Button>);
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Tab}{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("keeps focus but ignores activation while loading", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button loading onClick={onClick}>Sending</Button>);
    const button = screen.getByRole("button", { name: "Sending" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it("renders its child with button styles when asChild is set", () => {
    render(
      <Button asChild variant="primary">
        <a href="/app">Open console</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Open console" });
    expect(link).toHaveAttribute("href", "/app");
    expect(link.className).toContain("bg-fg-1");
  });

  it("applies variant and size classes and merges className last", () => {
    render(<Button variant="alarm" size="sm" className="w-full">Try to borrow</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("text-liq-hi");
    expect(button.className).toContain("h-8");
    expect(button.className).toContain("w-full");
  });

  it("hides the decorative arrow from assistive tech", () => {
    render(<Button>Next <ButtonArrow /></Button>);
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});
