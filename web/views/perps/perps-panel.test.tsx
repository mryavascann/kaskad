import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PerpMarket, PerpPosition } from "@/lib/chain/perpl-model";

const pos = (over: Partial<PerpPosition>): PerpPosition => ({ accountId: 1, side: "long", entry: 100_000, size: 1, deposit: 10_000, premium: 0, ...over });

// A long liquidated at $94k (-6 %), one at $98k (-2 %, "near"), a short at $106k (+6 %).
const btc: PerpMarket = {
  perpId: 1,
  symbol: "BTC",
  mark: 100_000,
  oracle: 99_990,
  mmf: 25,
  insurance: 178_649,
  liqInsShare: 0.1,
  oiLong: 2,
  oiShort: 1,
  positions: [pos({}), pos({ accountId: 2, deposit: 6_000 }), pos({ accountId: 3, side: "short" })],
  bids: [{ price: 99_990, size: 1.5 }],
  asks: [{ price: 100_010, size: 2 }],
  block: 110_313_001,
  at: 0,
};

const calls: string[] = [];
vi.mock("@/lib/chain/hooks/usePerplMarket", () => ({
  usePerplMarket: (symbol: string) => {
    calls.push(symbol);
    return symbol === "BTC" ? { market: btc, error: false, readAt: Date.now() - 4_000 } : { market: null, error: false, readAt: null };
  },
}));

const { PerpsPanel, analyse } = await import("./perps-panel");

describe("PerpsPanel", () => {
  it("shows the live market and how many positions are near liquidation", () => {
    render(<PerpsPanel locale="en" />);
    expect(screen.getByText("$100,000")).toBeInTheDocument();
    expect(screen.getByText("$200.0K long · $100.0K short")).toBeInTheDocument();
    const fund = [...document.querySelectorAll('[data-slot="readout-row"]')].find((r) => r.textContent?.includes("Insurance fund"));
    expect(fund).toHaveTextContent("$178.6K");
    expect(screen.getByText("3 · 1 within 5% of liquidation")).toBeInTheDocument();
    expect(screen.getByText(/Read 4 s ago · block #110,313,001/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /BTC: notional liquidated per 1% of price movement/ })).toBeInTheDocument();
  });

  it("says what catches the liquidations, and fills the price-move table", () => {
    render(<PerpsPanel locale="en" />);
    expect(screen.getByText("Within 5% of the mark the book holds $150.0K of bids and $200.0K of asks.")).toBeInTheDocument();
    expect(screen.getByText(/The insurance fund \(\$178\.6K\) covers every deficit up to ±50%/)).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /^−10%/ });
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("2"); // both longs liquidated
  });

  it("switches market and reads it", async () => {
    const user = userEvent.setup();
    render(<PerpsPanel locale="tr" />);
    await user.click(screen.getByRole("radio", { name: "ETH" }));
    expect(calls.at(-1)).toBe("ETH");
    expect(screen.getByText("Perpl okunuyor…")).toBeInTheDocument();
  });

  it("analyse: book exhaustion and ADL thresholds come from the model", () => {
    const a = analyse(btc);
    expect(a.near).toBe(1);
    expect(a.adl).toEqual({ down: null, up: null });
    expect(a.book.down).toBeLessThan(0);
  });
});
