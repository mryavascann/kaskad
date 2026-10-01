import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a switch named by its visible label, off by default", () => {
    render(<Switch label="Sound" />);
    const sound = screen.getByRole("switch", { name: "Sound" });
    expect(sound).toHaveAttribute("aria-checked", "false");
    expect(sound).toHaveAttribute("type", "button");
  });

  it("toggles on click, Space and Enter", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Sound" onCheckedChange={onCheckedChange} />);
    const sound = screen.getByRole("switch", { name: "Sound" });

    await user.click(sound);
    expect(sound).toHaveAttribute("aria-checked", "true");

    await user.keyboard(" ");
    expect(sound).toHaveAttribute("aria-checked", "false");

    await user.keyboard("{Enter}");
    expect(sound).toHaveAttribute("aria-checked", "true");
    expect(onCheckedChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it("follows the checked prop when controlled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Show grid" checked onCheckedChange={onCheckedChange} />);
    const grid = screen.getByRole("switch", { name: "Show grid" });
    await user.click(grid);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    expect(grid).toHaveAttribute("aria-checked", "true");
  });

  it("starts on with defaultChecked and does nothing when disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Sound" defaultChecked disabled onCheckedChange={onCheckedChange} />);
    const sound = screen.getByRole("switch", { name: "Sound" });
    expect(sound).toHaveAttribute("aria-checked", "true");
    expect(sound).toBeDisabled();
    await user.click(sound);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
