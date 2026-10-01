import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveIndicator, StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("is decorative without a label", () => {
    const { container } = render(<StatusDot tone="safe" />);
    const dot = container.firstElementChild!;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).not.toHaveAttribute("role");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("becomes an image with a name when labelled", () => {
    render(<StatusDot tone="liq" label="RPC offline" />);
    expect(screen.getByRole("img", { name: "RPC offline" })).toHaveAttribute("data-tone", "liq");
  });

  it("breathes only with motion allowed when pulsing", () => {
    const { container } = render(<StatusDot pulse />);
    expect(container.querySelector("[data-slot='dot']")).toHaveClass("motion-safe:animate-live");
  });

  it("adds the sonar ring only when asked", () => {
    const { container, rerender } = render(<StatusDot />);
    expect(container.querySelector("[data-slot='ping']")).toBeNull();
    rerender(<StatusDot ping />);
    expect(container.querySelector("[data-slot='ping']")).not.toBeNull();
  });
});

describe("LiveIndicator", () => {
  it("shows the label and the value with en-US grouping", () => {
    render(<LiveIndicator label="Monad testnet" value={65813636} />);
    expect(screen.getByText("Monad testnet")).toBeInTheDocument();
    expect(screen.getByText("Block")).toBeInTheDocument();
    expect(screen.getByText("65,813,636")).toBeInTheDocument();
  });

  it("renders a skeleton, a loading label and aria-busy while the value is null", () => {
    const { container } = render(<LiveIndicator label="Connecting" tone="warn" value={null} loadingLabel="Reading block" />);
    expect(screen.getByText("Reading block")).toHaveClass("sr-only");
    expect(container.querySelector("[data-slot='skeleton']")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText(/^\d/)).toBeNull();
  });

  it("shows the label only when there is no value", () => {
    render(<LiveIndicator label="RPC unreachable" tone="liq" />);
    expect(screen.getByText("RPC unreachable")).toBeInTheDocument();
    expect(screen.queryByText("Block")).toBeNull();
  });

  it("is not a live region (a block counter would flood screen readers)", () => {
    const { container } = render(<LiveIndicator label="Monad testnet" value={1} valueLabel="Height" />);
    expect(screen.getByText("Height")).toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
