import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuardTeaser } from "./guard-teaser";

// A market state as readMarkets() returns it (B paused by the Guard, its max LTV lowered).
const markets = { a: { paused: false, maxLtvBps: 9_000 }, b: { paused: true, maxLtvBps: 7_000 } };

describe("GuardTeaser", () => {
  it("shows each market's read state in words", () => {
    render(<GuardTeaser locale="en" markets={markets} />);
    const a = screen.getByRole("article", { name: "Market A" });
    const b = screen.getByRole("article", { name: "Market B" });
    expect(a).toHaveTextContent("Borrows open");
    expect(a).toHaveTextContent("No circuit breaker");
    expect(a).toHaveTextContent("90%");
    expect(b).toHaveTextContent("Borrows paused");
    expect(b).toHaveTextContent("Breaker tripped");
    expect(b).toHaveTextContent("70%");
  });

  it("keeps the card boxes with skeletons when the markets could not be read", () => {
    render(<GuardTeaser locale="tr" markets={null} />);
    expect(screen.getByRole("article", { name: "Piyasa B" })).not.toHaveTextContent("%");
    expect(screen.getByRole("article", { name: "Piyasa B" }).querySelector("[data-slot='skeleton']")).not.toBeNull();
  });
});
