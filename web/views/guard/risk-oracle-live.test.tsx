import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RISK } from "@/lib/kaskad/config";
import type { RiskAsset, RiskReport, RiskRule, RiskSystem } from "@/lib/chain/risk-oracle";

const WAD = 10n ** 18n;
const NOW = 1_791_043_000;
const rule: RiskRule = {
  enabled: true,
  steps: 20,
  rounds: 3,
  maxPositions: 0,
  oracleFeedbackBps: 0,
  triggerShockBps: 1_000,
  lossThresholdBps: 100,
  stuckThresholdBps: 2_000,
  ltvFloorBps: 7_000,
  ltvCeilingBps: 9_000,
  ltvStepBps: 500,
  minInterval: 600,
};
const rep = (shockBps: number, publishedAt: number, [bad, stuck, hidden]: bigint[] = [0n, 0n, 0n]): RiskReport => ({
  shockBps,
  publishedAt,
  blockNumber: 67_870_361n,
  positions: 57,
  totalDebt: 123_685_701n * WAD,
  badDebt: bad * WAD,
  stuckDebt: stuck * WAD,
  hiddenBadDebt: hidden * WAD,
  liquidated: 0n,
  oraclePrice: WAD,
  spotPrice: WAD,
});
// syrupUSDC: published 20 min ago (cooldown over); WETH: published 2 min ago (cooldown running).
const syrup: RiskAsset = {
  assetId: 9,
  rule,
  state: { atRisk: true, recommendedLtvBps: 8_500, lastPublished: NOW - 1_200, lossBps: 714, stuckBps: 7_824 },
  reports: [
    rep(100, NOW - 1_200),
    rep(300, NOW - 1_200, [0n, 110_987_638n, 255_394n]),
    rep(1_000, NOW - 1_200, [17_749n, 96_777_238n, 8_817_433n]),
    rep(2_000, NOW - 1_200, [13_254_245n, 80_442n, 8_317_544n]),
  ],
  bookPositions: 57,
};
const weth: RiskAsset = {
  assetId: 5,
  rule,
  state: { atRisk: false, recommendedLtvBps: 9_000, lastPublished: NOW - 120, lossBps: 0, stuckBps: 0 },
  reports: [100, 300, 1_000, 2_000].map((s) => ({ ...rep(s, NOW - 120), positions: 42 })),
  bookPositions: 42,
};
const system: RiskSystem = {
  assets: [syrup, weth],
  markets: [
    { address: RISK.marketSyrupUSDC, name: "kUSD / syrupUSDC", assetId: 9, paused: true, maxLtvBps: 8_500, vaultDeposit: 0n, flagged: true },
    { address: RISK.marketWETH, name: "kUSD / WETH", assetId: 5, paused: false, maxLtvBps: 9_000, vaultDeposit: 10n ** 12n, flagged: false },
  ],
  vault: { totalAssets: 10n ** 12n, idle: 0n, maxReportAge: 86_400 },
  guard: { maxReportAge: 86_400, recoveryDelay: 1_800 },
};

const set = vi.fn();
const publishMock = vi.fn();
vi.mock("@/lib/chain/hooks/useRiskSystem", () => ({ useRiskSystem: () => ({ system, error: false, refresh: vi.fn(), set }) }));
vi.mock("@/lib/chain/hooks/useSigner", () => ({ useSigner: () => ({ kind: "burner", address: null }) }));
vi.mock("@/lib/chain/risk-oracle", async (orig) => ({
  ...(await orig<typeof import("@/lib/chain/risk-oracle")>()),
  publishGasLimit: async () => 2_048_380n,
}));
vi.mock("@/lib/chain/actions/lazy", async (orig) => ({
  ...(await orig<typeof import("@/lib/chain/actions/lazy")>()),
  publishRisk: (...args: unknown[]) => publishMock(...args),
}));
// The passkey gate is a pass-through here: these tests are about the buttons behind it.
vi.mock("../shared/tx/passkey-gate", () => ({ PasskeyGate: ({ children }: { children: ReactNode }) => children }));

vi.spyOn(Date, "now").mockReturnValue(NOW * 1000);
const { RiskOracleLive } = await import("./risk-oracle-live");

beforeEach(() => {
  publishMock.mockReset();
  set.mockReset();
});

describe("RiskOracleLive", () => {
  it("states each asset's verdict in words, with the rule and the stored reports", () => {
    render(<RiskOracleLive locale="en" />);
    const s = screen.getByRole("article", { name: "syrupUSDC" });
    expect(within(s).getByText("At risk")).toBeInTheDocument();
    expect(within(s).getByText("Decides on the −10% shock: at risk when bad + hidden bad debt exceeds 1% of the debt, or stuck debt exceeds 20%.")).toBeInTheDocument();
    expect(within(s).getByText("Each publish moves the max LTV by 5%, between 70% and 90%.")).toBeInTheDocument();
    expect(within(s).getByText("85%")).toBeInTheDocument();
    expect(within(s).getByText("7.1%")).toBeInTheDocument();
    const trigger = within(s).getByRole("row", { name: /−10%/ });
    expect(trigger).toHaveAttribute("aria-current", "true");
    expect(within(trigger).getAllByRole("cell").map((c) => c.textContent)).toEqual(["$17.7K", "$96.8M", "$8.8M"]);
    expect(within(s).getByText("Published 20 min ago, block #67,870,361 · whole book, 57 positions")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "WETH" })).getByText("Clear")).toBeInTheDocument();
  });

  it("shows the markets and the vault from the chain", () => {
    render(<RiskOracleLive locale="en" />);
    expect(screen.getByText("Borrows paused")).toBeInTheDocument();
    expect(screen.getByText(/the vault keeps out/)).toBeInTheDocument();
    expect(screen.getByText("Vault deposit $1.0M")).toBeInTheDocument();
    expect(screen.getByText("$1.0M kUSD")).toBeInTheDocument();
  });

  it("disables publish while the cooldown runs", () => {
    render(<RiskOracleLive locale="en" />);
    const w = screen.getByRole("article", { name: "WETH" });
    expect(within(w).getByRole("button", { name: "Publish WETH" })).toBeDisabled();
    expect(within(w).getByText("Next publish possible in 8 min.")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "syrupUSDC" })).getByRole("button", { name: "Publish syrupUSDC" })).toBeEnabled();
  });

  it("publishes and reports the new recommendation (TR)", async () => {
    const after: RiskSystem = { ...system, assets: [{ ...syrup, state: { ...syrup.state, recommendedLtvBps: 8_000 } }, weth] };
    publishMock.mockImplementation(async (_asset: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ step: "sending", detail: "sync", raw: "" });
      opts.onEvent({ step: "confirmed", raw: "" });
      return { status: "confirmed", hash: `0x${"ab".repeat(32)}`, ms: 410, sync: true, receipt: {}, system: after };
    });
    const user = userEvent.setup();
    render(<RiskOracleLive locale="tr" />);
    await user.click(screen.getByRole("button", { name: "syrupUSDC yayınla" }));
    expect(publishMock).toHaveBeenCalledWith(syrup, expect.any(Object));
    expect(await screen.findByText("Yayınlandı: Riskli, önerilen maks. LTV %80.")).toBeInTheDocument();
    expect(set).toHaveBeenCalledWith(after);
  });
});
