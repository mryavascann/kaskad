import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Chip, ChipGroup } from "./chip";

function ShockPresets() {
  const [shock, setShock] = useState(3);
  return (
    <ChipGroup aria-label="Shock presets">
      {[1, 3, 5].map((v) => (
        <Chip key={v} mono pressed={shock === v} onClick={() => setShock(v)}>
          {`${v}%`}
        </Chip>
      ))}
    </ChipGroup>
  );
}

describe("Chip", () => {
  it("groups chips under a label and marks the pressed one", () => {
    render(<ShockPresets />);
    const group = screen.getByRole("group", { name: "Shock presets" });
    expect(within(group).getByRole("button", { name: "3%" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "1%" })).toHaveAttribute("aria-pressed", "false");
  });

  it("can be built into a single-select group (click and keyboard)", async () => {
    const user = userEvent.setup();
    render(<ShockPresets />);
    await user.click(screen.getByRole("button", { name: "5%" }));
    expect(screen.getByRole("button", { name: "5%" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "3%" })).toHaveAttribute("aria-pressed", "false");

    screen.getByRole("button", { name: "1%" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "1%" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is a plain button without aria-pressed when not a toggle", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip icon={UserRound} onClick={onClick}>
        Largest syrupUSDC borrower
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Largest syrupUSDC borrower" });
    expect(chip).not.toHaveAttribute("aria-pressed");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await user.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies mono, size and tone styles and merges className", () => {
    render(
      <Chip mono size="md" tone="liq" pressed className="w-full">
        30%
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "30%" });
    expect(chip.className).toContain("font-mono");
    expect(chip.className).toContain("h-9");
    expect(chip.className).toContain("aria-pressed:text-liq-hi");
    expect(chip.className).toContain("w-full");
  });
});
