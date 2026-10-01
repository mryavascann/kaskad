import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { Slider } from "./slider";

type ShockProps = Omit<ComponentProps<typeof Slider>, "value" | "onValueChange"> & {
  initial?: number;
  onChange?: (value: number) => void;
};

/** The console's shock slider: 0–50 %, step 0.1. */
function ShockSlider({ initial = 3, onChange, ...props }: ShockProps) {
  const [value, setValue] = useState(initial);
  return (
    <Slider
      label="Price drop"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      min={0}
      max={50}
      step={0.1}
      formatValue={(v) => `−${v.toFixed(1)}%`}
      {...props}
    />
  );
}

describe("Slider", () => {
  it("exposes a slider named by its visible label, with range and value text", () => {
    render(<ShockSlider />);
    const slider = screen.getByRole("slider", { name: "Price drop" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "50");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuetext", "−3.0%");
  });

  it("focuses the thumb when its visible label is clicked", async () => {
    const user = userEvent.setup();
    render(<ShockSlider />);
    await user.click(screen.getByText("Price drop"));
    expect(screen.getByRole("slider", { name: "Price drop" })).toHaveFocus();
  });

  it("takes its name from aria-label when there is no visible label", () => {
    render(<Slider aria-label="Duration" value={20} onValueChange={() => {}} min={1} max={100} />);
    expect(screen.getByRole("slider", { name: "Duration" })).toHaveAttribute("aria-valuetext", "20");
  });

  it("steps with arrows, ×10 with PageUp / PageDown, and jumps with Home / End", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<ShockSlider onValueCommit={onCommit} />);
    const slider = screen.getByRole("slider");

    await user.tab();
    expect(slider).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "3.1");
    expect(slider).toHaveAttribute("aria-valuetext", "−3.1%");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "2.9");

    await user.keyboard("{PageUp}");
    expect(slider).toHaveAttribute("aria-valuenow", "3.9");

    await user.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    expect(slider).toHaveAttribute("aria-valuetext", "−50.0%");

    await user.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(onCommit).toHaveBeenLastCalledWith(0);
  });

  it("shows the formatted value in the tone that toneForValue picks", async () => {
    const user = userEvent.setup();
    render(<ShockSlider initial={9.9} showValue toneForValue={(v) => (v >= 10 ? "liq" : "warn")} />);
    expect(screen.getByText("−9.9%")).toHaveClass("text-warn");
    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("−10.0%")).toHaveClass("text-liq-hi");
  });

  it("jumps to a mark on click, commits it and hands focus to the thumb", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <ShockSlider
        marks={[
          { value: 10, label: "10%" },
          { value: 30, label: "30%" },
        ]}
        marksLabel="Shock presets"
        onValueCommit={onCommit}
      />,
    );
    const presets = screen.getByRole("group", { name: "Shock presets" });
    expect(presets).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "30%" }));
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "30");
    expect(onCommit).toHaveBeenCalledWith(30);
    expect(slider).toHaveFocus();
  });

  it("skips a mark label that would collide with a larger one", () => {
    // Before the track is measured it is assumed 320px wide: 0.1 % and 0.5 % sit ~1px apart.
    render(<ShockSlider marks={[0.1, 0.5, 30].map((v) => ({ value: v, label: `${v}%` }))} />);
    expect(screen.queryByRole("button", { name: "0.1%" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0.5%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30%" })).toBeInTheDocument();
  });

  it("ignores the keyboard when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ShockSlider disabled onChange={onChange} />);
    const slider = screen.getByRole("slider");
    expect(slider).not.toHaveAttribute("tabindex");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-valuenow", "3");
  });
});
