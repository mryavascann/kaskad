import { encodeFunctionResult, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { kaskadAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { fixtureBook, fixtureRun } from "./__fixtures__/load";
import { fetchFinding, fetchFindingPositions, findingFacts, findingScenario } from "./finding";
import type { ChainReader } from "./reader";

const sali = fixtureRun("sali");
const meta = { engine: DEPLOYMENT.contracts.kaskadMC!, blockNumber: 66_989_757n, fetchedAt: 1 };

describe("finding", () => {
  it("is the 'sali' preset: syrupUSDC -3 %, real book, external oracle", () => {
    expect(findingScenario()).toEqual({ assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 0 });
  });

  it("maps the engine result to the README finding (recorded preview)", () => {
    const f = findingFacts(sali.result, findingScenario(), meta);
    expect(f.stuckDebtUsd).toBeCloseTo(110_987_638.08, 1); // README "$111,0M"
    expect(f.clearedUsd).toBeCloseTo(133_890.84, 1); // README "~$134k"
    expect(f.gapRatio!).toBeCloseTo(828.94, 2); // "~829x"
    expect(f).toMatchObject({
      assetId: 9,
      symbol: "syrupUSDC",
      shockPct: 3,
      oracle: "external",
      book: "real",
      badDebtUsd: 0,
      liquidations: 1,
      rounds: 1,
      positionsUsed: 57,
      poolDepthUsd: DEPLOYMENT.assets[9].depthUsd,
      depthIsAssumption: false,
      depthNote: DEPLOYMENT.assets[9].depthNote,
      sourceBlock: DEPLOYMENT.source.block,
      blockNumber: 66_989_757n,
    });
    expect(f.stuckShare).toBeCloseTo(f.stuckDebtUsd / f.totalDebtUsd, 12);
    expect(f.gasUsed).toBe(sali.result.gasUsed);
  });

  it("has no ratio when nothing was liquidated", () => {
    expect(findingFacts({ ...sali.result, totalLiquidated: 0n }, findingScenario(), meta).gapRatio).toBeNull();
  });

  it("fetchFinding: block number, then one preview pinned to it on KaskadMC with the 30M cap", async () => {
    const call = vi.fn<(a: { to: string; gas: bigint; blockNumber?: bigint; data: Hex }) => Promise<{ data: Hex }>>(async () => ({
      data: encodeFunctionResult({ abi: kaskadAbi, functionName: "preview", result: sali.result }),
    }));
    const getBlockNumber = vi.fn<(a?: { cacheTime?: number }) => Promise<bigint>>(async () => 66_989_757n);
    const f = await fetchFinding({ reader: { call, getBlockNumber } as unknown as ChainReader });
    expect(getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toMatchObject({ to: DEPLOYMENT.contracts.kaskadMC, gas: 30_000_000n, blockNumber: 66_989_757n });
    expect(f.blockNumber).toBe(66_989_757n);
    expect(f.gapRatio!).toBeCloseTo(828.94, 2);
    expect(f.result).toEqual(sali.result);
  });

  it("fetchFindingPositions: book read + classification against the finding's preview", async () => {
    const book = fixtureBook("9");
    const readContract = vi.fn(async (req: { functionName: string }) =>
      req.functionName === "source"
        ? DEPLOYMENT.contracts.kaskad
        : req.functionName === "assets"
          ? [book.priceWad, book.depthUsdWad]
          : req.functionName === "bookStats"
            ? [0n, book.bookDebt1e6, 0n, book.count]
            : 0,
    );
    const multicall = vi.fn(async (req: { contracts: { args: readonly bigint[] }[] }) => req.contracts.map((c) => book.positions[Number(c.args[1])].raw));
    const f = findingFacts(sali.result, findingScenario(), meta);
    const c = await fetchFindingPositions(f, { reader: { readContract, multicall } as unknown as ChainReader });
    expect(c.consistent && c.counts.stuck).toBe(30);
  });
});
