import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { wadToNum } from "@/lib/kaskad/format";
import { vizRun } from "./__fixtures__/data";
import { vizFormats } from "./format";
import { GapBars } from "./gap-bars";

const sali = vizRun("sali").run;
const cleared = wadToNum(sali.result.totalLiquidated);
const stuck = wadToNum(sali.result.stuckDebt);
const f = vizFormats();

describe("GapBars", () => {
  it("computes the ratio from the two inputs and says it in the caption", () => {
    const { container } = render(<GapBars cleared={cleared} stuck={stuck} />);
    const ratio = f.ratio(stuck / cleared);
    expect(ratio).toBe("~829×");
    expect(screen.getByText(ratio)).toBeInTheDocument();
    const caption = container.querySelector("figcaption");
    expect(caption).toHaveTextContent(`${f.usd(stuck)} can't be liquidated instantly: ${ratio} the ${f.usd(cleared)} the pool lets a liquidator clear.`);
    expect(screen.getByRole("figure", { name: "Liquidity gap" })).toBeInTheDocument();
  });

  it("draws both bars on the same scale; the small one never thinner than a hairline", () => {
    const { container } = render(<GapBars cleared={cleared} stuck={stuck} />);
    const bars = [...container.querySelectorAll<HTMLElement>("figure [aria-hidden] > span")];
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toMatch(/^max\(1px, 0\.\d+%\)$/);
    expect(bars[1].style.width).toBe("max(1px, 100%)");
    expect(screen.getByText(/Drawn to scale: the cleared bar is 0\.1% of the other one\./)).toBeInTheDocument();
  });

  it("shows the values as text with their labels", () => {
    render(<GapBars cleared={cleared} stuck={stuck} />);
    expect(screen.getByText(f.usd(cleared))).toBeInTheDocument();
    expect(screen.getByText(f.usd(stuck))).toBeInTheDocument();
    expect(screen.getByText("What the pool lets a liquidator clear")).toBeInTheDocument();
    expect(screen.getByText("Debt that can't be liquidated instantly")).toBeInTheDocument();
  });

  it("handles a run where an instant sale clears nothing", () => {
    const { container } = render(<GapBars cleared={0} stuck={stuck} />);
    expect(container.querySelector("figcaption")).toHaveTextContent("an instant sale into the pool clears nothing");
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("has loading, empty and error states", () => {
    const { container, rerender } = render(<GapBars cleared={null} stuck={null} />);
    expect(container.querySelector('figure[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText("Loading the liquidity gap")).toBeInTheDocument();

    rerender(<GapBars cleared={0} stuck={0} />);
    expect(screen.getByText("Nothing to compare")).toBeInTheDocument();

    rerender(<GapBars cleared={null} stuck={null} error="eth_call failed" />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load the liquidity gap");
  });

  it("renders the footnote slot and takes copy and formatters from props", () => {
    render(
      <GapBars
        cleared={cleared}
        stuck={stuck}
        footnote={<p>Model note</p>}
        formatRatio={(r) => `${Math.round(r)} kat`}
        copy={{ ratioLabel: "Likidite açığı" }}
      />,
    );
    expect(screen.getByText("Model note")).toBeInTheDocument();
    expect(screen.getByText("829 kat")).toBeInTheDocument();
    expect(screen.getByText("Likidite açığı")).toBeInTheDocument();
  });
});
