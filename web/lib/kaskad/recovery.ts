// Assumed share of the pool's displacement that arbitrage closes between two blocks (bps),
// set on KaskadMC by scripts/src/set-recovery.ts. These are assumptions about liquidity that
// exists outside the modeled DEX pool; the UI labels them as such.
export const RECOVERY_BPS: Record<number, { bps: number; why: string }> = {
  5: { bps: 5_000, why: "Monad WETH: CEX ve köprü arbitrajı, Monad DEX'i sığ" },
  7: { bps: 9_000, why: "Ethereum WETH: CEX-DEX arbitrajı her blokta" },
  13: { bps: 9_000, why: "Ethereum USDC: CEX-DEX arbitrajı, Circle itfası" },
  14: { bps: 5_000, why: "Ethereum USDe: CEX hacmi + Ethena mint/itfa (izinli)" },
  2: { bps: 1_000, why: "Monad USDe: zincir üstü çıkış neredeyse yok" },
  10: { bps: 1_000, why: "sUSDe: unstake bekleme süresi, DEX sığ" },
  8: { bps: 2_000, why: "weETH: itfa kuyruğu, Monad DEX sığ" },
  9: { bps: 0, why: "syrupUSDC: Maple itfası günler sürüyor, CEX yok" },
  15: { bps: 0, why: "syrupUSDT: Maple itfası günler sürüyor, CEX yok" },
  12: { bps: 0, why: "PT-AUSD: yalnızca Pendle AMM" },
};
