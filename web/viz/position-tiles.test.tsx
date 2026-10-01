import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { positionsOf, vizRun } from "./__fixtures__/data";
import { PositionTiles } from "./position-tiles";
import { openDataTables } from "./__fixtures__/open-tables";

const sali = vizRun("sali");
const usde = vizRun("usde-eth-5-pool");

const tiles = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[role="img"] > [data-state]')];
const legendCount = (label: string) => within(screen.getByText(label).closest("li") as HTMLElement).getByText(/^\d+$/).textContent;

describe("PositionTiles", () => {
  it("summarises the end of the run in one sentence instead of 57 stops", () => {
    const { container } = render(<PositionTiles classification={sali.positions} />);
    expect(
      screen.getByRole("img", {
        name: "57 positions at the end of the run: 0 with bad debt, 30 stuck below the liquidation threshold, 0 liquidated, 27 safe.",
      }),
    ).toBeInTheDocument();
    expect(tiles(container)).toHaveLength(57);
    expect(container.querySelectorAll("button, a, [tabindex='0']:not([role='region'])")).toHaveLength(0);
  });

  it("orders tiles closest to liquidation first", () => {
    const { container } = render(<PositionTiles classification={sali.positions} />);
    const states = tiles(container).map((t) => t.dataset.state);
    // The 30 stuck positions are the 30 closest to liquidation.
    expect(states.slice(0, 30).every((s) => s === "stuck")).toBe(true);
    expect(states.slice(30).every((s) => s === "safe")).toBe(true);
  });

  it("shows every outcome with its own count in the legend", () => {
    render(<PositionTiles classification={usde.positions} table={false} />);
    const counts = usde.run.counts;
    expect(legendCount("Bad debt")).toBe(String(counts["bad-debt"]));
    expect(legendCount("Stuck")).toBe(String(counts.stuck));
    expect(legendCount("Liquidated")).toBe(String(counts.liquidated));
    expect(legendCount("Safe")).toBe(String(counts.safe));
  });

  it("follows the replay step: the first liquidation at block 7, then positions below threshold", () => {
    const { rerender, container } = render(<PositionTiles classification={sali.positions} step={7} steps={20} prices={sali.prices} />);
    expect(
      screen.getByRole("img", { name: "57 positions at block 7 of 20: 1 liquidated, 0 below the liquidation threshold, 56 not hit yet." }),
    ).toBeInTheDocument();
    expect(tiles(container)[0].dataset.state).toBe("liquidated");
    expect(legendCount("Not hit yet")).toBe("56");

    rerender(<PositionTiles classification={sali.positions} step={19} steps={20} prices={sali.prices} />);
    const below = tiles(container).filter((t) => t.dataset.state === "below").length;
    expect(below).toBeGreaterThan(0);
    expect(legendCount("Below threshold")).toBe(String(below));

    rerender(<PositionTiles classification={sali.positions} step={20} steps={20} prices={sali.prices} />);
    expect(tiles(container).filter((t) => t.dataset.state === "stuck")).toHaveLength(30);
  });

  it("sizes tiles by debt with weight='debt'", () => {
    const { container } = render(<PositionTiles classification={sali.positions} weight="debt" table={false} />);
    const largest = Math.max(...positionsOf(sali).map((p) => Math.round(p.debtUsd)));
    const grows = tiles(container).map((t) => Number(t.style.flexGrow));
    expect(grows[0]).toBeGreaterThan(0);
    expect(Math.max(...grows)).toBe(largest);
    expect(screen.getByText(/Width is proportional to debt\./)).toBeInTheDocument();
  });

  it("mounts the table rows only once its disclosure is opened", () => {
    render(<PositionTiles classification={sali.positions} />);
    expect(screen.getByText("Positions table")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    openDataTables();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("lists every position in a table", () => {
    render(<PositionTiles classification={sali.positions} />);
    openDataTables();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(58);
    expect(within(table).getByText("#12")).toBeInTheDocument();
  });

  it("keeps the box while loading (expectedCount skeleton tiles) and says why when the replay does not match", () => {
    const { container, rerender } = render(<PositionTiles classification={null} expectedCount={57} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(57);
    expect(screen.getByText("Loading positions")).toBeInTheDocument();

    rerender(<PositionTiles classification={{ consistent: false, bookId: 9, mismatches: [{ field: "stuckDebt", engine: "1", replay: "2" }] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Per-position view unavailable");
  });

  it("takes its copy from props", () => {
    render(<PositionTiles classification={sali.positions} copy={{ stateStuck: "Sıkışmış", stateSafe: "Güvende" }} table={false} />);
    expect(legendCount("Sıkışmış")).toBe("30");
    expect(legendCount("Güvende")).toBe("27");
  });
});
