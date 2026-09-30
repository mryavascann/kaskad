import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Steps, type Step } from "./steps";

const steps: Step[] = [
  { id: "burner", label: "Preparing burner wallet", status: "done" },
  { id: "send", label: "Sending", status: "active", detail: "Waiting for the receipt" },
  { id: "confirm", label: "Confirmed", status: "pending" },
];

describe("Steps", () => {
  it("is an ordered list in flow order", () => {
    render(<Steps steps={steps} aria-label="Transaction progress" />);
    const list = screen.getByRole("list", { name: "Transaction progress" });
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-status"))).toEqual(["done", "active", "pending"]);
  });

  it('marks only the active step with aria-current="step"', () => {
    render(<Steps steps={steps} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("speaks each status, since the marker is visual only", () => {
    render(<Steps steps={steps} />);
    const [done, active, pending] = screen.getAllByRole("listitem");
    expect(done).toHaveTextContent("Preparing burner wallet, Done");
    expect(active).toHaveTextContent("Sending, In progress");
    expect(pending).toHaveTextContent("Confirmed, Not started");
    expect(active).toHaveTextContent("Waiting for the receipt");
  });

  it("shows the failure and its reason", () => {
    const { container } = render(
      <Steps
        steps={[
          { id: "send", label: "Sending", status: "error", detail: "Transaction reverted: BorrowIsPaused" },
          { id: "confirm", label: "Confirmed", status: "pending" },
        ]}
      />,
    );
    const failed = screen.getAllByRole("listitem")[0];
    expect(failed).toHaveTextContent("Sending, Failed");
    expect(within(failed).getByText("Transaction reverted: BorrowIsPaused")).toHaveClass("text-liq-hi");
    expect(container.querySelector("svg.lucide-octagon-alert")).not.toBeNull();
  });

  it("uses a spinner for the active step, a check when done and a number when pending", () => {
    const { container } = render(<Steps steps={steps} />);
    const [done, active, pending] = container.querySelectorAll("li");
    expect(done.querySelector("svg.lucide-check")).not.toBeNull();
    expect(active.querySelector("svg.lucide-loader-circle")).toHaveClass("motion-safe:animate-spin");
    expect(pending).toHaveTextContent("03");
  });

  it("accepts translated status labels", () => {
    render(<Steps steps={steps} statusLabels={{ done: "Tamam" }} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Preparing burner wallet, Tamam");
  });
});
