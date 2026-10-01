import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { guardAbi, kaskadAbi, kaskadMCAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { PROOF_TXS, readProof, readProofs, type ProofReader } from "./proofs";
import type { Scenario } from "./types";

const scenario: Scenario = { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 0 };
const wad = (usd: number) => BigInt(Math.round(usd * 1e6)) * 10n ** 12n;
const SIM_ID = `0x${"ab".repeat(32)}` as Hex;
const SENDER = "0x000000000000000000000000000000000000dEaD";

function simulationLog() {
  const topics = encodeEventTopics({ abi: kaskadAbi, eventName: "SimulationDone", args: { simId: SIM_ID, sender: SENDER } });
  const data = encodeAbiParameters(
    [{ type: "uint16" }, { type: "uint16" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [9, 300, wad(133_890.84), 0n, 3n, 57n, 387_554n, 29_632n],
  );
  return { address: DEPLOYMENT.contracts.kaskad, topics: topics as Hex[], data };
}

function monteCarloLog() {
  const topics = encodeEventTopics({ abi: kaskadMCAbi, eventName: "MonteCarloDone", args: { simId: SIM_ID, sender: SENDER } });
  const data = encodeAbiParameters(
    [{ type: "uint16" }, { type: "uint16" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [9, 300, 56n, wad(84_276_655.8), wad(119_371_510.7), wad(119_394_388.9), 28_756_612n, 40_000n],
  );
  return { address: DEPLOYMENT.contracts.kaskadMC!, topics: topics as Hex[], data };
}

function guardLog() {
  const topics = encodeEventTopics({ abi: guardAbi, eventName: "GuardChecked", args: { simId: SIM_ID } });
  const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "bool" }], [9_371n, 222n, true]);
  return { address: DEPLOYMENT.contracts.guard, topics: topics as Hex[], data };
}

function stubReader(input: Hex, logs: { address: string; topics: Hex[]; data: Hex }[], to: string): ProofReader {
  return {
    getTransaction: async () => ({ input, to }) as never,
    getTransactionReceipt: async () => ({ status: "success", blockNumber: 65_835_898n, gasUsed: 699_687n, logs }) as never,
    getBlock: async () => ({ timestamp: 1_790_420_938n }) as never,
  };
}

describe("proof ledger", () => {
  it("lists every README proof once, with full hashes", () => {
    expect(new Set(PROOF_TXS.map((p) => p.id)).size).toBe(PROOF_TXS.length);
    for (const p of PROOF_TXS) expect(p.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("decodes a cascade proof: scenario from calldata, result from the event", async () => {
    const input = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] });
    const r = await readProof(PROOF_TXS[0], stubReader(input, [simulationLog()], DEPLOYMENT.contracts.kaskadMC!));
    expect(r.scenario).toEqual(scenario);
    expect(r.simulation?.totalBadDebt).toBe(0n);
    expect(r.simulation?.positionsUsed).toBe(57n);
    expect(r.timestamp).toBe(1_790_420_938_000);
    expect(r.monteCarlo).toBeNull();
  });

  it("decodes a Monte Carlo proof with its path count", async () => {
    const input = encodeFunctionData({ abi: kaskadMCAbi, functionName: "simulateMC", args: [{ ...scenario, oracleFeedbackBps: 10_000 }, 56n, 1n] });
    const r = await readProof(PROOF_TXS[4], stubReader(input, [monteCarloLog()], DEPLOYMENT.contracts.kaskadMC!));
    expect(r.paths).toBe(56n);
    expect(r.scenario?.oracleFeedbackBps).toBe(10_000);
    expect(r.monteCarlo?.worstBadDebt).toBe(wad(119_394_388.9));
  });

  it("decodes the guard decision from the guard's own log", async () => {
    const input = encodeFunctionData({ abi: guardAbi, functionName: "refresh" });
    const r = await readProof(PROOF_TXS[5], stubReader(input, [simulationLog(), guardLog()], DEPLOYMENT.contracts.guard));
    expect(r.scenario).toBeNull();
    expect(r.guard).toMatchObject({ badDebtRatioBps: 9_371n, tripped: true });
  });

  it("keeps going when one proof cannot be read", async () => {
    const input = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [scenario] });
    let calls = 0;
    const reader: ProofReader = {
      ...stubReader(input, [simulationLog()], DEPLOYMENT.contracts.kaskad),
      getTransaction: async () => {
        if (calls++ === 0) throw new Error("rpc down");
        return { input, to: DEPLOYMENT.contracts.kaskad } as never;
      },
    };
    const out = await readProofs(reader);
    expect(out[0]).toMatchObject({ ok: false, id: "finding", error: "rpc down" });
    expect(out.filter((p) => p.ok).length).toBeGreaterThan(0);
  });
});
