import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEPLOYMENT } from "@/lib/kaskad/config";

const refresh = vi.fn();
const borrowMock = vi.fn();
const runGuardMock = vi.fn();

vi.mock("@/lib/chain/hooks/useGuardMarkets", () => ({
  useGuardMarkets: () => ({
    a: { paused: false, maxLtvBps: 9_000, borrowed: 3_000n * 10n ** 18n },
    b: { paused: true, maxLtvBps: 7_000, borrowed: 0n },
    refresh,
  }),
}));

vi.mock("@/lib/chain/hooks/useGuardConfig", () => ({
  useGuardConfig: () => ({
    loading: false,
    error: null,
    info: {
      config: {
        address: DEPLOYMENT.contracts.guard,
        scenario: { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 10_000 },
        badDebtThresholdBps: 50,
        liquidationThresholdBps: 0,
        safeLtvBps: 7_000,
        engine: DEPLOYMENT.contracts.kaskad,
        market: DEPLOYMENT.contracts.marketB,
      },
      gasLimit: 1_500_000n,
      preview: { positionsUsed: 57 },
      verdict: { badDebtRatioBps: 9_371, liquidationRatioBps: 222, wouldTrip: true },
    },
  }),
}));

vi.mock("@/lib/chain/hooks/useSigner", () => ({ useSigner: () => ({ kind: "burner", address: null }) }));
vi.mock("@/lib/chain/actions/borrow", () => ({ borrow: (...args: unknown[]) => borrowMock(...args) }));
vi.mock("@/lib/chain/actions/runGuard", () => ({ runGuard: (...args: unknown[]) => runGuardMock(...args) }));

const { GuardLive } = await import("./guard-live");

beforeEach(() => {
  borrowMock.mockReset();
  runGuardMock.mockReset();
});

describe("GuardLive", () => {
  it("states the rule read from the Guard, with the live verdict", () => {
    render(<GuardLive locale="en" />);
    expect(screen.getByText("syrupUSDC −3%, oracle follows the pool (worst case), real book (57 positions)")).toBeInTheDocument();
    expect(screen.getByText("bad debt > 0.5% of the simulated debt")).toBeInTheDocument();
    expect(screen.getByText("borrowing paused on market B, maximum LTV lowered to 70%")).toBeInTheDocument();
    expect(screen.getByText(/93\.7% of the debt: refresh\(\) would pause market B/)).toBeInTheDocument();
  });

  it("shows each market's state in words, not only color", () => {
    render(<GuardLive locale="en" />);
    const a = screen.getByRole("article", { name: /Market A/ });
    const b = screen.getByRole("article", { name: /Market B/ });
    expect(within(a).getByText("Borrows open")).toBeInTheDocument();
    expect(within(a).getByText("No circuit breaker")).toBeInTheDocument();
    expect(within(b).getByText("Borrows paused")).toBeInTheDocument();
    expect(within(b).getByText("Breaker tripped")).toBeInTheDocument();
    expect(within(a).getByText("3,000 units")).toBeInTheDocument();
  });

  it("visualizes the free pre-check revert on the paused market", async () => {
    borrowMock.mockImplementation(async (_market: string, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ step: "failed", detail: "borrow-paused", raw: "BorrowIsPaused" });
      return { status: "failed", error: { code: "borrow-paused", raw: "BorrowIsPaused" } };
    });
    const user = userEvent.setup();
    render(<GuardLive locale="en" />);
    const b = screen.getByRole("article", { name: /Market B/ });
    await user.click(within(b).getByRole("button", { name: "Try to borrow 1,000 units" }));
    expect(borrowMock).toHaveBeenCalledWith(DEPLOYMENT.contracts.marketB, expect.any(Object));
    expect(await within(b).findByText(/revert BorrowIsPaused\(\)/)).toBeInTheDocument();
    expect(within(b).getByText(/nothing was spent/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("runs the Guard and reports the decoded decision", async () => {
    runGuardMock.mockImplementation(async (opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ step: "sending", detail: "sync", raw: "" });
      opts.onEvent({ step: "confirmed", raw: "" });
      return {
        status: "confirmed",
        hash: `0x${"f7".repeat(32)}`,
        ms: 253,
        sync: true,
        receipt: {},
        checked: { simId: "0x", badDebtRatioBps: 9_371n, liquidationRatioBps: 222n, tripped: true },
        markets: null,
      };
    });
    const user = userEvent.setup();
    render(<GuardLive locale="tr" />);
    await user.click(screen.getByRole("button", { name: "Guard'ı çalıştır" }));
    expect(await screen.findByText("Kontrol edildi: karşılıksız borç oranı %93,7. B piyasası durdurulmuş kalıyor.")).toBeInTheDocument();
    expect(screen.getByText(/253 ms içinde onaylandı/)).toBeInTheDocument();
  });
});
