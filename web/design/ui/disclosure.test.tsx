import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./disclosure";

describe("Disclosure", () => {
  it("is closed by default and opens from its summary", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="How was this calculated?">
        <p>Every borrower is replayed through the shock.</p>
      </Disclosure>,
    );
    const summary = screen.getByText("How was this calculated?");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Every borrower is replayed through the shock.")).toBeVisible();
  });

  it("keeps the native summary: first in tab order, no role override, closes again on a second click", async () => {
    // Enter / Space on <summary> are native browser behavior (jsdom does not simulate them).
    const user = userEvent.setup();
    render(<Disclosure summary="Advanced settings">Settings</Disclosure>);
    const summary = screen.getByText("Advanced settings").closest("summary");
    const details = summary?.closest("details");

    await user.tab();
    expect(summary).toHaveFocus();
    expect(summary).not.toHaveAttribute("role");
    expect(summary).not.toHaveAttribute("tabindex");

    await user.click(summary!);
    expect(details).toHaveAttribute("open");
    await user.click(summary!);
    expect(details).not.toHaveAttribute("open");
  });

  it("can start open, with a mono panel summary", () => {
    render(
      <Disclosure summary="Advanced settings" defaultOpen mono variant="panel">
        Settings
      </Disclosure>,
    );
    const summary = screen.getByText("Advanced settings").closest("summary");
    expect(summary?.closest("details")).toHaveAttribute("open");
    expect(summary).toHaveClass("label-mono");
    expect(summary?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
