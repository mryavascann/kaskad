import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PerplWallet } from "@/lib/chain/perpl-wallet-risk";

const state = vi.hoisted(() => ({ data: null as PerplWallet | null, error: false, addresses: [] as (string | null)[] }));
vi.mock("@/lib/chain/hooks/usePerplWallet", () => ({ usePerplWallet: (address: string | null) => {
  state.addresses.push(address);
  return { data: address ? state.data : null, error: address ? state.error : false, loading: false };
} }));
const { PerplWalletPanel } = await import("./perpl-wallet-panel");
const address = "0x1111111111111111111111111111111111111111";
const wallet: PerplWallet = { address, account: { id: "6", balance: 100, locked: 30, frozen: false }, block: 123, readAt: 1_700_000_000_000, unsupportedMarkets: [], positions: [{ accountId: 6, perpId: 1, symbol: "BTC", side: "long", entry: 100, mark: 100, size: 2, deposit: 20, premium: 0, mmf: 25 }] };
beforeEach(() => { state.data = wallet; state.error = false; state.addresses = []; });
function submit(locale = "en") {
  fireEvent.change(screen.getByLabelText(locale === "en" ? "Wallet address" : "Cüzdan adresi"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Check wallet" : "Cüzdanı sorgula" }));
}

describe("Perpl wallet panel", () => {
  it("validates before lookup and only submits an explicit address", () => {
    render(<PerplWalletPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Check wallet" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid 0x");
    expect(state.addresses.every((a) => a === null)).toBe(true);
    submit();
    expect(state.addresses.at(-1)).toBe(address);
  });
  it("shows wallet thresholds and stress separately from projected losses", () => {
    render(<PerplWalletPanel locale="en" />); submit();
    const table = screen.getByRole("table", { name: "This wallet's positions" });
    expect(within(table).getByRole("row", { name: /BTC Long/ })).toHaveTextContent("6.0%");
    expect(within(table).getByRole("row", { name: /BTC Long/ })).toHaveTextContent("$94");
    const shocks = screen.getByRole("table", { name: "Wallet exposure under a price move" });
    expect(within(shocks).getByRole("row", { name: /−10%/ })).toHaveTextContent("$200");
    expect(screen.getByText(/not predicted losses/)).toBeInTheDocument();
  });
  it("clears previously displayed results as soon as the address is edited", () => {
    render(<PerplWalletPanel locale="en" />); submit();
    fireEvent.change(screen.getByLabelText("Wallet address"), { target: { value: "0x2" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(state.addresses.at(-1)).toBeNull();
  });
  it("localizes the empty account state and clears the input", () => {
    state.data = { ...wallet, account: null, positions: [] };
    render(<PerplWalletPanel locale="tr" />); submit("tr");
    expect(screen.getByRole("status")).toHaveTextContent("Perpl hesabı yok");
    fireEvent.click(screen.getByRole("button", { name: "Temizle" }));
    expect(screen.getByLabelText("Cüzdan adresi")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("marks stale and partial data instead of silently declaring an account safe", () => {
    state.error = true; state.data = { ...wallet, unsupportedMarkets: [7] };
    render(<PerplWalletPanel locale="en" />); submit();
    expect(screen.getByText(/Refresh failed/)).toBeInTheDocument();
    expect(screen.getByText(/position totals are partial/)).toHaveTextContent("7");
  });
  it("distinguishes an existing account without positions", () => {
    state.data = { ...wallet, positions: [] };
    render(<PerplWalletPanel locale="en" />); submit();
    expect(screen.getByRole("status")).toHaveTextContent("No open positions");
    expect(screen.getByText("Account #6")).toBeInTheDocument();
  });
});
