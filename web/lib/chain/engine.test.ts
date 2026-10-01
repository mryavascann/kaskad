import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { fixtureRun } from "./__fixtures__/load";
import {
  MC_MAX_PATHS,
  MC_SEED,
  PREVIEW_GAS,
  engineFor,
  findMaxPaths,
  monteCarloFacts,
  previewCurve,
  previewError,
  previewMonteCarlo,
  previewScenario,
} from "./engine";
import type { ChainReader } from "./reader";
import type { MonteCarloResult } from "./types";

type CallArgs = { to: string; data: Hex; gas: bigint; blockNumber?: bigint };
const stub = (call: (a: CallArgs) => Promise<{ data?: Hex }>) => {
  const fn = vi.fn(call);
  return { fn, reader: { call: fn } as unknown as ChainReader };
};

const sali = fixtureRun("sali");

describe("engine routing and previews", () => {
  it("engineFor: real books -> KaskadMC, calibrated (>= 256) -> Kaskad (useKaskad.ts:50-52)", () => {
    expect(engineFor(9)).toBe(DEPLOYMENT.contracts.kaskadMC);
    expect(engineFor(256 | 9)).toBe(DEPLOYMENT.contracts.kaskad);
    expect(engineFor(256)).toBe(DEPLOYMENT.contracts.kaskad);
  });

  it("previewScenario: eth_call with the 30M cap, kaskadAbi encoding, decoded Result", async () => {
    const encoded = encodeFunctionResult({ abi: kaskadAbi, functionName: "preview", result: sali.result });
    const { fn, reader } = stub(async () => ({ data: encoded }));
    const r = await previewScenario(sali.scenario, { reader });
    expect(r).toEqual(sali.result);
    expect(fn).toHaveBeenCalledTimes(1);
    const args = fn.mock.calls[0][0];
    expect(args).toEqual({ to: DEPLOYMENT.contracts.kaskadMC, gas: 30_000_000n, data: encodeFunctionData({ abi: kaskadAbi, functionName: "preview", args: [sali.scenario] }) });
    expect(PREVIEW_GAS).toBe(30_000_000n);
  });

  it("pins the block and overrides the engine when asked", async () => {
    const encoded = encodeFunctionResult({ abi: kaskadAbi, functionName: "preview", result: sali.result });
    const { fn, reader } = stub(async () => ({ data: encoded }));
    await previewScenario(sali.scenario, { reader, blockNumber: 42n, engine: DEPLOYMENT.contracts.kaskad });
    expect(fn.mock.calls[0][0]).toMatchObject({ to: DEPLOYMENT.contracts.kaskad, blockNumber: 42n });
  });

  it("throws on an empty result (useKaskad.ts:58)", async () => {
    await expect(previewScenario(sali.scenario, { reader: stub(async () => ({})).reader })).rejects.toThrow("empty eth_call result");
  });

  it("previewCurve decodes bad / liquidated per shock", async () => {
    const encoded = encodeFunctionResult({ abi: kaskadAbi, functionName: "previewCurve", result: [[1n, 2n], [3n, 4n], 5n, 6n] });
    const { fn, reader } = stub(async () => ({ data: encoded }));
    expect(await previewCurve(sali.scenario, [100, 300], { reader })).toEqual({ bad: [1n, 2n], liq: [3n, 4n], gasUsed: 5n, memoryBytes: 6n });
    const { args } = decodeFunctionData({ abi: kaskadAbi, data: fn.mock.calls[0][0].data });
    expect(args).toEqual([sali.scenario, [100, 300]]);
  });
});

describe("previewError (legacy classification, useKaskad.ts:96-99)", () => {
  it("any message mentioning gas is out-of-gas, as before", () => {
    expect(previewError(new Error("execution reverted: out of gas")).code).toBe("out-of-gas");
    // viem's CallExecutionError lists the call args, so even a network failure matches /gas/:
    const viemLike = Object.assign(new Error("HTTP request failed.\n\nRaw Call Arguments:\n  to: 0x94\n  gas: 30000000"), { shortMessage: "HTTP request failed." });
    expect(previewError(viemLike)).toEqual({ code: "out-of-gas", raw: viemLike.message, shortMessage: "HTTP request failed." });
    expect(previewError(new Error("empty eth_call result")).code).toBe("failed");
  });
});

const mcResult = (paths: bigint): MonteCarloResult => ({
  paths,
  positionsUsed: 57n,
  totalDebt: 123_685_701n * 10n ** 18n,
  meanBadDebt: 10n ** 24n,
  p95BadDebt: 2n * 10n ** 24n,
  worstBadDebt: 3n * 10n ** 24n,
  lossPaths: paths / 2n,
  meanShockBps: 300n,
  worstShockBps: 850n,
  gasUsed: 20_000n * paths,
  memoryBytes: 12_448n,
  badDebt: Array.from({ length: Number(paths) }, (_, i) => BigInt(i) * 10n ** 18n),
  shockBps: Array.from({ length: Number(paths) }, (_, i) => BigInt(i * 10)),
});

/** KaskadMC stub: fits in 30M gas up to `limit` paths, reverts above (as out of gas). */
function mcReader(limit: number) {
  return stub(async ({ to, data, gas }) => {
    expect(to).toBe(DEPLOYMENT.contracts.kaskadMC);
    expect(gas).toBe(30_000_000n);
    const { args } = decodeFunctionData({ abi: kaskadMCAbi, data });
    const [, paths, seed] = args as readonly [unknown, bigint, bigint];
    expect(seed).toBe(MC_SEED);
    if (paths > BigInt(limit)) throw new Error("out of gas");
    return { data: encodeFunctionResult({ abi: kaskadMCAbi, functionName: "previewMC", result: mcResult(paths) }) };
  });
}

describe("Monte Carlo", () => {
  it("previewMonteCarlo decodes, and returns null when it does not fit (MonteCarlo.tsx:37-48)", async () => {
    const { reader } = mcReader(100);
    const ok = await previewMonteCarlo(sali.scenario, 30, { reader });
    expect(ok).toEqual(mcResult(30n));
    expect(await previewMonteCarlo(sali.scenario, 101, { reader })).toBeNull();
  });

  it("findMaxPaths: binary search over [0, 2000] finds the largest K that fits (MonteCarlo.tsx:85-101)", async () => {
    const { fn, reader } = mcReader(213);
    const probes: number[] = [];
    const out = await findMaxPaths(sali.scenario, { reader, onProbe: (k) => probes.push(k) });
    expect(out.k).toBe(213);
    expect(out.result?.paths).toBe(213n);
    expect(out.probes).toBe(fn.mock.calls.length);
    expect(out.probes).toBeLessThanOrEqual(Math.ceil(Math.log2(MC_MAX_PATHS + 1)));
    expect(probes[0]).toBe(1_000);
    expect((await findMaxPaths(sali.scenario, { reader: mcReader(0).reader })).k).toBe(0);
    expect((await findMaxPaths(sali.scenario, { reader: mcReader(5_000).reader })).k).toBe(MC_MAX_PATHS);
  });

  it("findMaxPaths stops when aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { fn, reader } = mcReader(213);
    expect(await findMaxPaths(sali.scenario, { reader, signal: ctrl.signal })).toEqual({ k: 0, result: null, probes: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("monteCarloFacts: USD numbers, shares and fractions", () => {
    const f = monteCarloFacts(mcResult(10n));
    expect(f).toMatchObject({ paths: 10, positionsUsed: 57, positionScenarios: 570, meanBadDebtUsd: 1e6, p95BadDebtUsd: 2e6, worstBadDebtUsd: 3e6, worstShockPct: 8.5, meanShockPct: 3, lossPaths: 5, lossPathShare: 0.5 });
    expect(f.gasFraction).toBeCloseTo(200_000 / 30_000_000, 12);
    expect(f.points[3]).toEqual({ shockPct: 0.3, badDebtUsd: 3 });
  });
});
