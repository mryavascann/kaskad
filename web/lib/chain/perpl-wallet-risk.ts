import { liquidationPrice, residualAt, type PerpPosition } from "./perpl-model";

export type WalletPosition = PerpPosition & { perpId: number; symbol: string; mark: number; mmf: number };
export type PerplWallet = {
  address: string;
  block: number;
  readAt: number;
  account: { id: string; balance: number; locked: number; frozen: boolean } | null;
  positions: WalletPosition[];
  /** Active perpetuals outside the six markets supported by this dashboard. */
  unsupportedMarkets: number[];
};

export function walletPositionRisk(p: WalletPosition) {
  const liquidation = liquidationPrice(p, p.mmf);
  const distance = (p.side === "long" ? p.mark - liquidation : liquidation - p.mark) / p.mark;
  return { liquidation, distance, notional: p.mark * p.size, equity: residualAt(p, p.mark) };
}

export function walletSummary(wallet: PerplWallet) {
  const rows = wallet.positions.map(walletPositionRisk);
  return {
    available: Math.max(0, (wallet.account?.balance ?? 0) - (wallet.account?.locked ?? 0)),
    notional: rows.reduce((sum, p) => sum + p.notional, 0),
    equity: rows.reduce((sum, p) => sum + p.equity, 0),
    near: rows.filter((p) => p.distance <= 0.05).length,
  };
}

/** Threshold exposure only: the same signed price move in every supported market, no fill model. */
export function walletShock(positions: WalletPosition[], movePct: number) {
  const crossed = positions.filter((p) => {
    const { liquidation, distance } = walletPositionRisk(p);
    if (distance <= 0) return true;
    const shocked = p.mark * (1 + movePct / 100);
    return p.side === "long" ? shocked <= liquidation : shocked >= liquidation;
  });
  return { positions: crossed.length, notional: crossed.reduce((sum, p) => sum + p.mark * p.size, 0) };
}

export const WALLET_SHOCKS = [-5, -10, -20, 5, 10, 20] as const;
