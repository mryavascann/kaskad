import { describe, expect, it } from "vitest";
import * as math from "@/lib/kaskad/math";
import { FIXTURE_RUNS, fixtureRun } from "./__fixtures__/load";
import {
  ETH_READ_GAS_PER_POSITION,
  MIP8_PAGE_FIRST_TOUCH_EXTRA_GAS,
  MIP8_WARM_READ_GAS,
  MONAD_READ_GAS_PER_POSITION,
  ethEstimate,
  limitFacts,
  monadBookReadGas,
} from "./limits";
import type { Result } from "./types";

/** app/_components/LimitGauge.tsx:27-32 verbatim, literals included. */
function legacyEthEstimate(r: Result): number {
  const n = r.positionsUsed;
  const mem = Number(r.memoryBytes);
  const monadSload = n * 100 + Math.ceil(n / math.MONAD_PAGE_SLOTS) * 8_000;
  return Number(r.gasUsed) - monadSload + n * math.ETH_COLD_SLOAD + math.ethMemoryGas(mem) - math.monadMemoryGas(mem);
}

const synthetic = (positionsUsed: number, gasUsed: bigint, memoryBytes: bigint): Result => ({
  ...fixtureRun("sali").result,
  positionsUsed,
  gasUsed,
  memoryBytes,
});

describe("limits", () => {
  it("ethEstimate is the legacy estimate", () => {
    for (const r of FIXTURE_RUNS) expect(ethEstimate(r.result)).toBe(legacyEthEstimate(r.result));
    for (const [n, g, m] of [
      [1, 50_000n, 1_024n],
      [128, 900_000n, 64_000n],
      [129, 900_000n, 64_000n],
      [10_000, 17_700_000n, 1_600_000n],
    ] as const)
      expect(ethEstimate(synthetic(n, g, m))).toBe(legacyEthEstimate(synthetic(n, g, m)));
  });

  it("per-position read costs are derived from the MIP-8 model, not literals", () => {
    expect(MIP8_WARM_READ_GAS + MIP8_PAGE_FIRST_TOUCH_EXTRA_GAS).toBe(8_100); // PositionBook.sol:43-44
    expect(monadBookReadGas(128)).toBe(8_100 + 127 * 100);
    expect(monadBookReadGas(129)).toBe(129 * 100 + 2 * 8_000);
    expect(MONAD_READ_GAS_PER_POSITION).toBe(162.5);
    expect(ETH_READ_GAS_PER_POSITION).toBe(math.ETH_COLD_SLOAD);
  });

  it("limitFacts: fractions and one-tx booleans against the chain limits", () => {
    const f = limitFacts(fixtureRun("sali").result);
    expect(f.positions).toBe(57);
    expect(f.monad).toMatchObject({ gas: 387_554, gasLimit: 30_000_000, fitsOneTx: true, memoryBytes: 29_632, memoryLimit: 8 * 1024 * 1024 });
    expect(f.monad.gasFraction).toBeCloseTo(387_554 / 30_000_000, 12);
    expect(f.ethereum.gasEstimate).toBe(legacyEthEstimate(fixtureRun("sali").result));
    expect(f.ethereum.multipleOfMonad).toBeCloseTo(f.ethereum.gasEstimate / 387_554, 12);
    expect(f.readGasPerPosition.ratio).toBeCloseTo(2_100 / 162.5, 12);

    expect(limitFacts(synthetic(1, 30_000_000n, 0n)).monad.fitsOneTx).toBe(true);
    expect(limitFacts(synthetic(1, 30_000_001n, 0n)).monad.fitsOneTx).toBe(false);
    // synthetic large run: fits Monad's 30M limit, not Ethereum's 2^24 cap
    const big = limitFacts(synthetic(10_000, 17_700_000n, 1_600_000n));
    expect(big.monad.fitsOneTx).toBe(true);
    expect(big.ethereum.fitsOneTx).toBe(false);
    expect(big.ethereum.gasCap).toBe(math.ETH_TX_GAS_CAP);
  });
});
