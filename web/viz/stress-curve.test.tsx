import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VIZ_CURVE } from "./__fixtures__/load";
import { curveFromChain } from "./curve-model";
import { vizFormats } from "./format";
import { StressCurve } from "./stress-curve";
import { openDataTables } from "./__fixtures__/open-tables";

const data = curveFromChain(VIZ_CURVE, VIZ_CURVE.shocksBps);
const f = vizFormats();
const text = (i: number) =>
  `Shock ${f.pct(data.shocks[i])}: bad debt ${f.usd(data.external[i])} with the external price, ${f.usd(data.pool[i])} with the pool price`;

describe("StressCurve", () => {
  it("tells the two oracle modes apart by name, note, dash and marker", () => {
    const { container } = render(<StressCurve data={data} />);
    expect(screen.getAllByText("External price").length).toBeGreaterThan(0);
    expect(screen.getByText("realistic")).toBeInTheDocument();
    expect(screen.getAllByText("Pool price").length).toBeGreaterThan(0);
    expect(screen.getByText("worst case")).toBeInTheDocument();
    const pool = container.querySelector('[data-series="pool"] path');
    const external = container.querySelector('[data-series="external"] path');
    expect(pool).toHaveAttribute("stroke-dasharray", "6 4");
    expect(external).not.toHaveAttribute("stroke-dasharray");
    expect(container.querySelector('[data-series="pool"] path:nth-of-type(2)')).toHaveAttribute("stroke-linecap", "square");
    expect(container.querySelector('[data-series="external"] path:nth-of-type(2)')).toHaveAttribute("stroke-linecap", "round");
  });

  it("reads values at a shock level with the keyboard (crosshair + value text)", async () => {
    const user = userEvent.setup();
    const { container } = render(<StressCurve data={data} />);
    const explorer = screen.getByRole("slider", { name: "Shock level" });
    expect(container.querySelector('[data-slot="crosshair"]')).toBeNull();

    await user.tab();
    expect(explorer).toHaveFocus();
    expect(explorer).toHaveAttribute("aria-valuetext", text(0));
    expect(container.querySelector('[data-slot="crosshair"]')).not.toBeNull();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(explorer).toHaveAttribute("aria-valuenow", "3");
    expect(explorer).toHaveAttribute("aria-valuetext", text(3));
    await user.keyboard("{End}");
    expect(explorer).toHaveAttribute("aria-valuetext", text(data.shocks.length - 1));
    await user.keyboard("{Home}");
    expect(explorer).toHaveAttribute("aria-valuenow", "0");

    await user.tab();
    expect(container.querySelector('[data-slot="crosshair"]')).toBeNull();
  });

  it("describes both curves in a summary and lists every level in a table", () => {
    render(<StressCurve data={data} />);
    openDataTables();
    const summary = screen.getByRole("slider").getAttribute("aria-describedby") ?? "";
    const text = document.getElementById(summary)?.textContent ?? "";
    expect(text).toContain("Bad debt at 8 shock levels, 0.1% to 30.0%.");
    expect(text).toContain(`Pool price (worst case): bad debt from a 3.0% shock, ${f.usd(data.pool[7])} at 30.0%`);
    expect(text).toContain("External price (realistic): bad debt from a 10.0% shock");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(9);
  });

  it("marks a scenario shock", () => {
    render(<StressCurve data={data} marker={0.03} />);
    expect(screen.getByText("Scenario 3.0%")).toBeInTheDocument();
  });

  it("keeps short axis ticks and takes formatters from props", () => {
    render(<StressCurve data={data} formatUsdTick={(v) => `${v / 1e6} Mn $`} />);
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("0 Mn $")).toBeInTheDocument();
  });

  it("has loading and error states", () => {
    const { container, rerender } = render(<StressCurve data={null} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText("Loading the stress curve")).toBeInTheDocument();
    rerender(<StressCurve data={null} error="rate limited" />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load the stress curve");
  });
});
