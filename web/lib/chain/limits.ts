// Monad vs Ethereum limits for one engine run. ethEstimate() copied from
// app/_components/LimitGauge.tsx:26-32; its storage-read literals became named constants.

import {
  ETH_COLD_SLOAD,
  ETH_TX_GAS_CAP,
  MONAD_MEMORY_LIMIT,
  MONAD_PAGE_SLOTS,
  MONAD_TX_GAS_LIMIT,
  ethMemoryGas,
  monadMemoryGas,
} from "@/lib/kaskad/math";
import type { Result } from "./types";

export { ETH_COLD_SLOAD, ETH_TX_GAS_CAP, MONAD_MEMORY_LIMIT, MONAD_PAGE_SLOTS, MONAD_TX_GAS_LIMIT };

/**
 * Monad MIP-8 storage read model used by the estimate (LimitGauge.tsx:30, :46; PositionBook.sol:43-44
 * "8,100 gas for the first touch of a page, 100 gas for the rest"): every slot read costs the warm
 * price, and the first touch of each MONAD_PAGE_SLOTS-slot page adds the page surcharge.
 */
export const MIP8_WARM_READ_GAS = 100;
export const MIP8_PAGE_FIRST_TOUCH_EXTRA_GAS = 8_000;

/** Gas the engine pays to read n consecutive book slots on Monad under the model above. */
export function monadBookReadGas(n: number): number {
  return n * MIP8_WARM_READ_GAS + Math.ceil(n / MONAD_PAGE_SLOTS) * MIP8_PAGE_FIRST_TOUCH_EXTRA_GAS;
}

/** Amortized Monad read cost per position (a full page): 100 + 8,000 / 128 = 162.5 gas. */
export const MONAD_READ_GAS_PER_POSITION = MIP8_WARM_READ_GAS + MIP8_PAGE_FIRST_TOUCH_EXTRA_GAS / MONAD_PAGE_SLOTS;
/** Ethereum read cost per position: one cold SLOAD. */
export const ETH_READ_GAS_PER_POSITION = ETH_COLD_SLOAD;

/**
 * Rough Ethereum gas of the same run (LimitGauge.tsx:27-32): replace the Monad slot reads with cold
 * SLOADs and the linear memory cost with Ethereum's quadratic one. An estimate, label it as such.
 */
export function ethEstimate(r: Pick<Result, "positionsUsed" | "memoryBytes" | "gasUsed">): number {
  const n = r.positionsUsed;
  const mem = Number(r.memoryBytes);
  return Number(r.gasUsed) - monadBookReadGas(n) + n * ETH_COLD_SLOAD + ethMemoryGas(mem) - monadMemoryGas(mem);
}

/** Everything the limit gauge shows (LimitGauge.tsx:34-45), as numbers and booleans. */
export function limitFacts(r: Pick<Result, "positionsUsed" | "memoryBytes" | "gasUsed">) {
  const gas = Number(r.gasUsed);
  const mem = Number(r.memoryBytes);
  const eth = ethEstimate(r);
  return {
    positions: r.positionsUsed,
    monad: {
      gas,
      gasLimit: MONAD_TX_GAS_LIMIT,
      gasFraction: gas / MONAD_TX_GAS_LIMIT,
      fitsOneTx: gas <= MONAD_TX_GAS_LIMIT,
      memoryBytes: mem,
      memoryLimit: MONAD_MEMORY_LIMIT,
      memoryFraction: mem / MONAD_MEMORY_LIMIT,
      memoryGas: monadMemoryGas(mem),
    },
    ethereum: {
      /** Estimate, not a measurement. */
      gasEstimate: eth,
      gasCap: ETH_TX_GAS_CAP,
      gasFraction: eth / ETH_TX_GAS_CAP,
      fitsOneTx: eth <= ETH_TX_GAS_CAP,
      memoryGas: ethMemoryGas(mem),
      /** Ethereum estimate / Monad measured gas (LimitGauge.tsx:43 "x kat"). */
      multipleOfMonad: eth / Math.max(1, gas),
    },
    readGasPerPosition: {
      monad: MONAD_READ_GAS_PER_POSITION,
      ethereum: ETH_READ_GAS_PER_POSITION,
      ratio: ETH_READ_GAS_PER_POSITION / MONAD_READ_GAS_PER_POSITION,
    },
  };
}
