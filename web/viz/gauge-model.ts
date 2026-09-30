/**
 * Scales of the two gauges. Pure.
 * - HealthDial: health factor → needle angle, on a zone-weighted scale (below).
 * - GasGauge: gas of one run on Monad (measured) and Ethereum (estimate), one shared linear scale.
 */
import { clampUnit, linearTicks, niceMax, round } from "./geometry";

// ------------------------------------------------------------------ health factor

/**
 * Upper edge of the warning zone: the HF the survive suggestions aim for (SURVIVE_HF_TARGET = HF_DANGER
 * in lib/chain/wallet.ts; gauge-model.test.ts fails if they drift apart). Not imported, so the dial
 * does not pull the wallet module (viem, readers) into the client bundle.
 */
export const HF_TARGET = 1.05;

export type HfZone = "liquidatable" | "warning" | "safe";

export function hfZone(hf: number, target = HF_TARGET): HfZone {
  if (hf < 1) return "liquidatable";
  if (hf < target) return "warning";
  return "safe";
}

/**
 * Zone-weighted scale: each zone gets a readable share of the arc (liquidatable 0.8–1 → first
 * quarter, warning 1–target → next 15 %, safe target–1.5 → 30 %, 1.5–3 → the last 30 %), linear inside
 * each zone. The warning band is only 5 % of HF wide, so a linear or log dial would draw it as a
 * sliver; the tick labels carry the real values. Values outside 0.8–3 pin to the ends.
 */
export function hfStops(target = HF_TARGET) {
  const t = Math.min(1.45, Math.max(1.001, target));
  return { domain: [0.8, 1, t, 1.5, 3] as const, unit: [0, 0.25, 0.4, 0.7, 1] as const };
}

export function hfToUnit(hf: number, target = HF_TARGET): number {
  const { domain, unit } = hfStops(target);
  if (!(hf > domain[0])) return 0;
  if (hf >= domain[domain.length - 1]) return 1;
  for (let i = 1; i < domain.length; i++) {
    if (hf <= domain[i]) {
      const k = (hf - domain[i - 1]) / (domain[i] - domain[i - 1]);
      return clampUnit(unit[i - 1] + k * (unit[i] - unit[i - 1]));
    }
  }
  return 1;
}

/** Needle angle in degrees: −90 (left end) … 90 (right end), 0 = straight up. Rounded. */
export const hfAngle = (hf: number, target = HF_TARGET) => round(-90 + 180 * hfToUnit(hf, target), 3);

// ------------------------------------------------------------------ gas

/** The fields GasGauge reads; `limitFacts(result)` (lib/chain/limits) has all of them. */
export type LimitData = {
  positions: number;
  monad: { gas: number; gasLimit: number; fitsOneTx: boolean; memoryBytes: number; memoryLimit: number; memoryGas: number };
  ethereum: { gasEstimate: number; gasCap: number; fitsOneTx: boolean; memoryGas: number; multipleOfMonad: number };
};

export type GasScale = {
  max: number;
  ticks: number[];
  /** 0–1 position of a gas amount on the shared scale. */
  at: (gas: number) => number;
};

/** One linear scale for both chains, from 0 to the largest of the four numbers (nice). */
export function gasScale(d: LimitData): GasScale {
  const max = niceMax(Math.max(d.monad.gas, d.monad.gasLimit, d.ethereum.gasEstimate, d.ethereum.gasCap), 4);
  return { max, ticks: linearTicks(max, 4), at: (gas: number) => round(clampUnit(gas / max), 5) };
}

/** Memory gas of both chains on one scale (Ethereum's is quadratic). */
export function memoryGasScale(d: LimitData): GasScale {
  const max = niceMax(Math.max(d.monad.memoryGas, d.ethereum.memoryGas, 1), 4);
  return { max, ticks: linearTicks(max, 4), at: (gas: number) => round(clampUnit(gas / max), 5) };
}
