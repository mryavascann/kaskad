import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchCheck } from "@/lib/chain/hooks/useWatchlist";
import { WatchlistPanel } from "./watchlist-panel";

const A = "0x815f5BB257e88b67216a344C7C83a3eA4EE74748";
const B = "0x278AA16c5C8E1D68938A302e809F126863D81dAA";

const signer = { kind: "mera", address: null as string | null };
vi.mock("@/lib/chain/hooks/useSigner", () => ({ useSigner: () => signer }));
const connect = { busy: false, error: null, signIn: vi.fn(), preloadSignIn: vi.fn() };
vi.mock("@/lib/chain/hooks/useSignerConnect", () => ({ useSignerConnect: () => connect }));
const watch = {
  status: "ready" as "signed-out" | "loading" | "ready" | "error",
  entries: [{ address: B, alertDropPct: 5, label: "PT whale" }],
  error: null as string | null,
  saving: false,
  checks: { [B]: { status: "alert", drop: 0.0231 } } as Record<string, WatchCheck>,
  add: vi.fn(),
  remove: vi.fn(),
  checkAll: vi.fn(),
};
vi.mock("@/lib/chain/hooks/useWatchlist", () => ({ useWatchlist: () => watch }));

beforeEach(() => {
  signer.address = null;
  vi.clearAllMocks();
});

describe("WatchlistPanel", () => {
  it("asks for a passkey first and shows no list while signed out", async () => {
    const user = userEvent.setup();
    render(<WatchlistPanel locale="en" current={A} onCheck={vi.fn()} />);
    expect(screen.queryByText("PT whale")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sign in with passkey to open your watchlist" }));
    expect(connect.signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/never reach the server/)).toBeInTheDocument();
  });

  it("signed in: adds the checked address with its alert, flags entries inside their alert, removes and opens them", async () => {
    signer.address = "0x4444444444444444444444444444444444444444";
    const onCheck = vi.fn();
    const user = userEvent.setup();
    render(<WatchlistPanel locale="en" current={A} onCheck={onCheck} />);

    const alert = screen.getByLabelText(/Alert when it liquidates/);
    await user.clear(alert);
    await user.type(alert, "7.5");
    await user.type(screen.getByLabelText(/Label/), "syrup whale");
    await user.click(screen.getByRole("button", { name: "Add to watchlist" }));
    expect(watch.add).toHaveBeenCalledWith(A, 7.5, "syrup whale");

    const row = screen.getByText("PT whale").closest("li")!;
    expect(within(row).getByText(/alert at −5/)).toBeInTheDocument();
    expect(within(row).getByText(/Liquidates at −2\.3%: within your alert/)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: /^0x278A/ }));
    expect(onCheck).toHaveBeenCalledWith(B);
    await user.click(within(row).getByRole("button", { name: /Remove/ }));
    expect(watch.remove).toHaveBeenCalledWith(B);
    await user.click(screen.getByRole("button", { name: "Check all now" }));
    expect(watch.checkAll).toHaveBeenCalledTimes(1);
  });

  it("refuses an alert outside 1–50 %", async () => {
    signer.address = "0x4444444444444444444444444444444444444444";
    const user = userEvent.setup();
    render(<WatchlistPanel locale="en" current={A} onCheck={vi.fn()} />);
    const alert = screen.getByLabelText(/Alert when it liquidates/);
    await user.clear(alert);
    await user.type(alert, "80");
    expect(screen.getByRole("button", { name: "Add to watchlist" })).toBeDisabled();
  });
});
