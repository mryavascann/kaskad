import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fixtureBook } from "@/lib/chain/__fixtures__/load";
import { RISK_MAP_SHOCKS_BPS, riskRow, type RiskMap } from "@/lib/chain/risk-map";
import { RiskMapTable, severity } from "./risk-map";

const map: RiskMap = {
  rows: [riskRow(fixtureBook("9"), "monad"), riskRow(fixtureBook("14"), "ethereum")],
  shocksBps: RISK_MAP_SHOCKS_BPS,
  steps: 20,
  rounds: 3,
};

describe("RiskMapTable", () => {
  it("lays out books × shocks in two groups, with the finding's cell outlined", () => {
    render(<RiskMapTable locale="en" map={map} finding={{ assetId: 9, shockBps: 300 }} />);
    const table = screen.getByRole("table");
    expect(within(table.querySelector("thead")!).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Book", "Debt", "−1%", "−3%", "−5%", "−10%", "−20%"]);
    expect(within(table).getByText("Aave on Monad")).toBeInTheDocument();
    expect(within(table).getByText("Aave on Ethereum, simulated on Monad")).toBeInTheDocument();

    const syrup = within(table).getByRole("rowheader", { name: /syrupUSDC/ }).closest("tr")!;
    const cells = within(syrup).getAllByRole("cell").slice(1); // after the debt column
    expect(cells[0]).toHaveTextContent("clears");
    expect(cells[1]).toHaveTextContent(/\$111\.0M\s*stuck/);
    expect(cells[1].className).toMatch(/outline/);
    // The larger amount leads; what the oracle hides at −10 % follows on its own line.
    expect(cells[3]).toHaveTextContent(/^\$96\.8M\s*stuck\s*\+ \$17\.7K bad debt\s*\+ \$8\.8M hidden$/);
    expect(cells[1]).toHaveTextContent(/^\$111\.0M\s*stuck\s*\+ \$\d+(\.\d)?K hidden$/); // −3 %: a few hundred thousand
    expect(cells[0]).toHaveTextContent(/^clears$/); // −1 %: nothing stuck, bad or hidden

    expect(cells[4]).toHaveTextContent(/\$13\.3M\s*bad debt/);
    expect(Number(cells[4].dataset.severity)).toBeGreaterThan(Number(cells[1].dataset.severity));
  });

  it("speaks Turkish under /tr", () => {
    render(<RiskMapTable locale="tr" map={map} finding={{ assetId: 9, shockBps: 300 }} />);
    expect(screen.getByText("Monad'da Aave")).toBeInTheDocument();
    expect(screen.getAllByText("takılı").length).toBeGreaterThan(0);
  });
});

describe("severity", () => {
  it("ranks a realised loss above debt that is only stuck", () => {
    const cell = (stuck: number, bad: number) => ({ shockBps: 300, stuckDebtUsd: stuck, badDebtUsd: bad, liquidatedUsd: 0, hiddenBadDebtUsd: 0 });
    expect(severity(cell(0, 0), 100e6)).toBe(0);
    expect(severity(cell(1e6, 0), 100e6)).toBe(1);
    expect(severity(cell(10e6, 0), 100e6)).toBe(2);
    expect(severity(cell(90e6, 0), 100e6)).toBe(3);
    expect(severity(cell(0, 1e6), 100e6)).toBe(3);
    expect(severity(cell(0, 13e6), 100e6)).toBe(4);
    // A few dollars of bad debt next to a large stuck amount does not outrank it.
    expect(severity(cell(96.8e6, 17.7e3), 123.7e6)).toBe(3);
    expect(severity(cell(1e6, 17.7e3), 123.7e6)).toBe(1);
  });
});
