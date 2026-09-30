import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { monteCarloFacts } from "@/lib/chain/engine";
import { vizMonteCarlo } from "./__fixtures__/load";
import { vizFormats } from "./format";
import { MonteCarloChart } from "./monte-carlo-chart";

const worst = monteCarloFacts(vizMonteCarlo("worst").result);
const sali = monteCarloFacts(vizMonteCarlo("sali").result);
const f = vizFormats();

describe("MonteCarloChart", () => {
  it("summarises the recorded paths: loss share, mean, p95 and worst", () => {
    render(<MonteCarloChart facts={worst} />);
    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(name).toBe(
      `30 random price paths with a mean shock of ${f.pct(worst.meanShockPct / 100)}: 23 of them (${f.pct(worst.lossPathShare)}) end with bad debt. ` +
        `Mean bad debt ${f.usd(worst.meanBadDebtUsd)}, 95th percentile ${f.usd(worst.p95BadDebtUsd)}, worst ${f.usd(worst.worstBadDebtUsd)} (shock ${f.pct(worst.worstShockPct / 100)}).`,
    );
    expect(screen.getByText("23 of 30")).toBeInTheDocument();
  });

  it("draws one dot per path and the reference lines", () => {
    const { container } = render(<MonteCarloChart facts={worst} />);
    expect(container.querySelectorAll("path[stroke-linecap='round']")).toHaveLength(30);
    expect(container.querySelectorAll("path[data-loss]")).toHaveLength(23);
    expect(screen.getAllByText("Mean").length).toBeGreaterThan(0);
    expect(screen.getAllByText("p95").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Worst").length).toBeGreaterThan(0);
  });

  it("says so when no path loses money, without inventing ticks", () => {
    render(<MonteCarloChart facts={sali} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("none ends with bad debt");
    expect(screen.getByText("0 of 100")).toBeInTheDocument();
    expect(screen.queryByText("Mean")).toBeNull();
    expect(screen.getAllByText("$0")).toHaveLength(1 + sali.paths);
  });

  it("lists every path in a table", () => {
    render(<MonteCarloChart facts={worst} />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(31);
  });

  it("has loading and error states", () => {
    const { container, rerender } = render(<MonteCarloChart facts={null} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    rerender(<MonteCarloChart facts={null} error="does not fit in 30M gas" />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't run the Monte Carlo paths");
  });
});
