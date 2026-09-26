import { packPosition, toUnits6, usdTo6, type PackedPosition } from "./pack";

/** Normalized real position as produced by scripts/src/fetch-positions.ts. */
export type RealPosition = {
  user: string;
  eMode: number;
  collateralId: number;
  collateralRaw: string;
  collateralDecimals: number;
  collateralUsd: number;
  otherCollateralUsd: number;
  debtUsd: number;
  ltBps: number;
  bonusBps: number;
  hfModel: number | null;
};

export function realToPacked(p: RealPosition): PackedPosition {
  return {
    collateral: toUnits6(BigInt(p.collateralRaw), p.collateralDecimals),
    debt: usdTo6(p.debtUsd),
    otherColl: Math.round(p.otherCollateralUsd),
    collateralId: p.collateralId,
    ltBps: p.ltBps,
    bonusBps: p.bonusBps,
    eMode: p.eMode,
  };
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calibrated book: n positions sampled debt-weighted from the real book's health factors
 * (HF jittered by +-0.3%, never below 1.001 when the source was healthy), log-normal sizes
 * normalized so the total debt equals the real total exactly.
 * Any prefix is an iid sample, which is what the on-chain resolution knob relies on.
 */
export function calibrateBook(real: RealPosition[], n: number, priceUsd: number, seed = 42): PackedPosition[] {
  const src = real.filter((p) => p.debtUsd > 0 && p.hfModel !== null && Number.isFinite(p.hfModel));
  if (src.length === 0) throw new Error("empty real book");
  const totalDebt = src.reduce((s, p) => s + p.debtUsd, 0);
  const cum: number[] = [];
  let acc = 0;
  for (const p of src) cum.push((acc += p.debtUsd));

  const rand = rng(seed);
  const pick = () => {
    const x = rand() * acc;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return src[lo];
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  const weights = Array.from({ length: n }, () => Math.exp(normal()));
  const wSum = weights.reduce((s, w) => s + w, 0);

  const out: PackedPosition[] = [];
  for (let i = 0; i < n; i++) {
    const s = pick();
    const debt = (totalDebt * weights[i]) / wSum;
    let hf = s.hfModel! * (1 + (rand() - 0.5) * 0.006);
    if (s.hfModel! >= 1) hf = Math.max(hf, 1.001);
    const otherRatio = s.otherCollateralUsd / s.debtUsd;
    const other = otherRatio * debt;
    const collUsd = Math.max(0, (hf * debt * 10_000) / s.ltBps - other);
    out.push({
      collateral: usdTo6(collUsd / priceUsd),
      debt: usdTo6(debt),
      otherColl: Math.round(other),
      collateralId: s.collateralId,
      ltBps: s.ltBps,
      bonusBps: s.bonusBps,
      eMode: s.eMode,
    });
  }
  return out;
}

export const packAll = (ps: PackedPosition[]) => ps.map(packPosition);
