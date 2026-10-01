import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./segmented";

const MODES = [
  { value: "external", label: "External price (Chainlink / rate)", description: "What Aave uses" },
  { value: "pool", label: "Pool spot price", description: "Worst case: oracle follows the pool" },
] as const;

function OracleMode({ onChange }: { onChange?: (value: string) => void }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("external");
  return (
    <Segmented
      aria-label="Oracle price source"
      options={MODES}
      value={mode}
      onValueChange={(next) => {
        setMode(next);
        onChange?.(next);
      }}
    />
  );
}

describe("Segmented", () => {
  it("renders a named radio group with the current option checked", () => {
    render(<OracleMode />);
    expect(screen.getByRole("radiogroup", { name: "Oracle price source" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "External price (Chainlink / rate)" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Pool spot price" })).toHaveAttribute("aria-checked", "false");
  });

  it("links every option to its description", () => {
    render(<OracleMode />);
    expect(screen.getByRole("radio", { name: "External price (Chainlink / rate)" })).toHaveAccessibleDescription("What Aave uses");
    expect(screen.getByRole("radio", { name: "Pool spot price" })).toHaveAccessibleDescription("Worst case: oracle follows the pool");
  });

  it("selects on click and never clears the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OracleMode onChange={onChange} />);
    const pool = screen.getByRole("radio", { name: "Pool spot price" });

    await user.click(pool);
    expect(pool).toHaveAttribute("aria-checked", "true");
    await user.click(pool);
    expect(pool).toHaveAttribute("aria-checked", "true");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("pool");
  });

  it("moves focus and selection together with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<OracleMode />);
    const external = screen.getByRole("radio", { name: "External price (Chainlink / rate)" });
    const pool = screen.getByRole("radio", { name: "Pool spot price" });

    await user.tab();
    expect(external).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(pool).toHaveFocus());
    expect(pool).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(external).toHaveFocus());
    expect(external).toHaveAttribute("aria-checked", "true");
  });

  it("does not select a disabled option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Segmented
        aria-label="Book"
        value="real"
        onValueChange={onChange}
        options={[
          { value: "real", label: "Real" },
          { value: "calibrated", label: "Calibrated", disabled: true },
        ]}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Calibrated" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
