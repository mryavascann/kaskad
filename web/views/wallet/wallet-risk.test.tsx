import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
const reserve = {
  id: 9,
  symbol: "syrupUSDC",
  suppliedUsd: 35_800_000,
  borrowedUsd: 0,
  isCollateral: true,
  ltBps: 9_200,
  bonusBps: 400,
  utilization: 0,
  reserveSuppliedUsd: 138_000_000,
};
let state: Record<string, unknown> = {};

function withPosition() {
  state = {
    address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748",
    loading: false,
    error: null,
    identity: null,
    position: {
      address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748",
      block: 109_389_668,
      eMode: 1,
      hfOnchain: 1.022,
      collateralUsd: 35_800_000,
      debtUsd: 32_200_000,
      reserves: [reserve],
      dominant: reserve,
      otherLtAdjustedUsd: 0,
      protocol: { suppliedUsd: 531_000_000, debtUsd: 238_800_000 },
    },
    cascade: {},
    risk: {
      borrower: true,
      dominant: reserve,
      hf: 1.022,
      hfDanger: true,
      threshold: 0.0218,
      thresholdState: { kind: "at-drop", drop: 0.0218 },
      cascadeDrop: 0.03,
      cascadeStuckDebtUsd: 110_987_638,
      cascadeBadDebtUsd: 0,
      liquidatedInCascade: true,
      supplied: [{ ...reserve, withdraw: "collateral-only", liquidityShare: 1 }],
      lentUsd: 0,
      lossShareUsd: 0,
      headlineBadDebtUsd: 13_300_000,
    },
    survive: { addCollateralUsd: 2_900_000, repayUsd: 2_400_000 },
    shockPct: 5,
    setShockPct: vi.fn(),
    lookup,
    lookupWith: vi.fn(),
  };
}

vi.mock("@/lib/chain/hooks/useWalletRisk", () => ({ useWalletRisk: () => state }));

const { WalletRisk } = await import("./wallet-risk");

beforeEach(() => {
  lookup.mockReset();
  state = { address: "", loading: false, error: null, identity: null, position: null, cascade: null, risk: null, survive: null, shockPct: 5, setShockPct: vi.fn(), lookup, lookupWith: vi.fn() };
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("WalletRisk", () => {
  it("explains what the check does before any lookup", () => {
    render(<WalletRisk locale="en" />);
    expect(screen.getByRole("textbox", { name: /Monad mainnet address/ })).toBeInTheDocument();
    expect(screen.getByText("Your liquidation threshold")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Largest syrupUSDC borrower/ })).toBeInTheDocument();
  });

  it("states the liquidation threshold and the cascade outcome in one sentence each", () => {
    withPosition();
    render(<WalletRisk locale="en" />);
    expect(screen.getByText(/You get liquidated if syrupUSDC drops/)).toHaveTextContent("You get liquidated if syrupUSDC drops −2.18%.");
    expect(screen.getByText("In this scenario your position is liquidated.")).toBeInTheDocument();
    expect(screen.getByText("+$2.9M")).toBeInTheDocument();
    // Once in the table (640 px and up) and once in the stacked list (narrow screens); CSS shows one.
    expect(screen.getAllByText("collateral (not lent out)")).toHaveLength(2);
  });

  it("uses Turkish copy and number formats", () => {
    withPosition();
    render(<WalletRisk locale="tr" />);
    expect(screen.getByText(/düşerse likide olursun/)).toHaveTextContent("syrupUSDC −%2,18 düşerse likide olursun.");
    expect(screen.getByText("Bu senaryoda pozisyonun likide olur.")).toBeInTheDocument();
  });

  it("checks the address in the link on load", async () => {
    window.history.replaceState(null, "", "/wallet?address=0x815f5BB257e88b67216a344C7C83a3eA4EE74748");
    render(<WalletRisk locale="en" />);
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledWith("0x815f5BB257e88b67216a344C7C83a3eA4EE74748"));
  });

  it("ignores an invalid address in the link", async () => {
    window.history.replaceState(null, "", "/wallet?address=nope");
    render(<WalletRisk locale="en" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(lookup).not.toHaveBeenCalled();
  });
});
