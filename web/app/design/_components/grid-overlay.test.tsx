import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GridOverlayToggle } from "./grid-overlay";

const overlay = () => document.querySelector(".grid-page");

describe("GridOverlayToggle", () => {
  it("toggles the column overlay with the button", async () => {
    const user = userEvent.setup();
    render(<GridOverlayToggle />);
    const button = screen.getByRole("button", { name: /grid/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(overlay()).toBeNull();

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(overlay()?.children).toHaveLength(12);

    await user.click(button);
    expect(overlay()).toBeNull();
  });

  it("toggles with the G key, but not while typing in a field", async () => {
    const user = userEvent.setup();
    render(
      <>
        <GridOverlayToggle />
        <input aria-label="Address" />
      </>,
    );
    await user.keyboard("g");
    expect(screen.getByRole("button", { name: /grid/i })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("textbox", { name: "Address" }));
    await user.keyboard("g");
    expect(screen.getByRole("button", { name: /grid/i })).toHaveAttribute("aria-pressed", "true");
  });
});
