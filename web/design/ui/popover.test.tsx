import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";

function PoolDepth({ arrow = false }: { arrow?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger>Pool depth</PopoverTrigger>
      <PopoverContent aria-label="Pool depth" arrow={arrow}>
        <p>Sum of DEX reserves for the asset.</p>
        <PopoverClose>Close</PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

describe("Popover", () => {
  it("opens from its trigger and reports the state", async () => {
    const user = userEvent.setup();
    render(<PoolDepth />);
    const trigger = screen.getByRole("button", { name: "Pool depth" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Pool depth" })).toHaveTextContent("Sum of DEX reserves for the asset.");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<PoolDepth />);
    const trigger = screen.getByRole("button", { name: "Pool depth" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes from a PopoverClose inside it", async () => {
    const user = userEvent.setup();
    render(<PoolDepth />);
    await user.click(screen.getByRole("button", { name: "Pool depth" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("draws an arrow on request, hidden from assistive tech", async () => {
    const user = userEvent.setup();
    render(<PoolDepth arrow />);
    await user.click(screen.getByRole("button", { name: "Pool depth" }));
    const svg = screen.getByRole("dialog").querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
