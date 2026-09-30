import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function ResultViews(props: { value?: string; onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="monte-carlo" {...props}>
      <TabsList aria-label="Result views">
        <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
        <TabsTrigger value="stress-curve" count={2}>
          Stress curve
        </TabsTrigger>
        <TabsTrigger value="two-networks">Two networks</TabsTrigger>
      </TabsList>
      <TabsContent value="monte-carlo">Monte Carlo panel</TabsContent>
      <TabsContent value="stress-curve">Stress curve panel</TabsContent>
      <TabsContent value="two-networks">Two networks panel</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders a named tablist with the default tab selected and its panel labelled by it", () => {
    render(<ResultViews />);
    expect(screen.getByRole("tablist", { name: "Result views" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Monte Carlo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Monte Carlo" })).toHaveTextContent("Monte Carlo panel");
  });

  it("includes the count in the tab name, separated by a space", () => {
    render(<ResultViews />);
    expect(screen.getByRole("tab", { name: "Stress curve 2" })).toBeInTheDocument();
  });

  it("switches panels on click", async () => {
    const user = userEvent.setup();
    render(<ResultViews />);
    await user.click(screen.getByRole("tab", { name: "Two networks" }));
    expect(screen.getByRole("tab", { name: "Two networks" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Two networks panel");
  });

  it("moves with the arrow keys and Home / End, activating as it goes", async () => {
    const user = userEvent.setup();
    render(<ResultViews />);
    await user.tab();
    expect(screen.getByRole("tab", { name: "Monte Carlo" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Stress curve 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Stress curve panel");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Two networks" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Two networks" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Monte Carlo" })).toHaveAttribute("aria-selected", "true");
  });

  it("works controlled", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState("stress-curve");
      return (
        <ResultViews
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onValueChange(next);
          }}
        />
      );
    }
    render(<Controlled />);
    expect(screen.getByRole("tab", { name: "Stress curve 2" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Monte Carlo" }));
    expect(onValueChange).toHaveBeenCalledWith("monte-carlo");
    expect(screen.getByRole("tab", { name: "Monte Carlo" })).toHaveAttribute("aria-selected", "true");
  });
});
