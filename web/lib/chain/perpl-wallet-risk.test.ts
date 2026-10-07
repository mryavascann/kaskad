import { describe, expect, it } from "vitest";
import { walletPositionRisk, walletShock, walletSummary, type PerplWallet, type WalletPosition } from "./perpl-wallet-risk";

const position = (over: Partial<WalletPosition> = {}): WalletPosition => ({ accountId: 6, perpId: 1, symbol: "BTC", side: "long", entry: 100, mark: 100, size: 2, deposit: 20, premium: 0, mmf: 25, ...over });

describe("Perpl wallet risk", () => {
  it("uses isolated collateral and funding for long and short liquidation distances", () => {
    expect(walletPositionRisk(position())).toEqual({ liquidation: 94, distance: 0.06, notional: 200, equity: 20 });
    expect(walletPositionRisk(position({ side: "short", premium: -4 }))).toEqual({ liquidation: 104, distance: 0.04, notional: 200, equity: 16 });
    expect(walletPositionRisk(position({ mark: 110 }))).toMatchObject({ equity: 40, notional: 220 });
  });
  it("counts only thresholds crossed in the adverse direction, including exact boundaries", () => {
    const positions = [position(), position({ side: "short", perpId: 20 })];
    expect(walletShock(positions, -5)).toEqual({ positions: 0, notional: 0 });
    expect(walletShock(positions, -6)).toEqual({ positions: 1, notional: 200 });
    expect(walletShock(positions, 6)).toEqual({ positions: 1, notional: 200 });
    expect(walletShock([position({ mark: 90 })], 5).positions).toBe(1);
  });
  it("does not add free balance to position equity, and clamps locked-over-balance availability", () => {
    const wallet = { account: { id: "6", balance: 10_000, locked: 11_000, frozen: false }, positions: [position(), position({ deposit: 10 })] } as PerplWallet;
    expect(walletSummary(wallet)).toEqual({ available: 0, notional: 400, equity: 30, near: 1 });
  });
});
