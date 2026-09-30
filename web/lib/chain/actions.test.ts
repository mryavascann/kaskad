// Proof actions with an injected `send`: nothing here reaches sendTx or the network.
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  parseAbiParameters,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { guardAbi, kaskadAbi, kaskadMCAbi, mockMarketAbi } from "@/lib/kaskad/abi";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { monteCarloGasLimit, simulateGasLimit } from "@/lib/kaskad/math";
import { fixtureRun } from "./__fixtures__/load";
import { borrow } from "./actions/borrow";
import { proveMonteCarlo } from "./actions/proveMonteCarlo";
import { proveScenario } from "./actions/proveScenario";
import { runGuard } from "./actions/runGuard";
import { BORROW_AMOUNT, BORROW_GAS, GUARD_TX_OVERHEAD_GAS } from "./guard";
import type { ChainReader } from "./reader";
import { SIGNER_STATUS, type TxEvent } from "./status";
import { runTx, type SendFn } from "./tx";
import type { MonteCarloResult } from "./types";

const HASH = `0x${"ab".repeat(32)}` as Hex;
const SIM_ID = `0x${"11".repeat(32)}` as Hex;
const SENDER = "0x00000000000000000000000000000000000000aa" as Address;

type Log = { address: Address; data: Hex; topics: [Hex, ...Hex[]] };
const receipt = (status: "success" | "reverted", logs: Log[] = []) =>
  ({ transactionHash: HASH, status, logs }) as unknown as TransactionReceipt;

/** A fake sendTx that replays the burner's status strings, then returns the receipt. */
function fakeSend(r: TransactionReceipt, statuses: string[] = [SIGNER_STATUS.funding, SIGNER_STATUS.burnerSending]) {
  return vi.fn<SendFn>(async (_to, _data, _gas, onStatus) => {
    statuses.forEach(onStatus);
    return { receipt: r, ms: 321, sync: true };
  });
}

const sali = fixtureRun("sali");

describe("runTx", () => {
  it("heavy tx without a confirm UI is cancelled before sending", async () => {
    const send = fakeSend(receipt("success"));
    const out = await runTx({ to: SENDER, data: "0x", gas: 30_000_000n, confirmGate: true }, { send, signerKind: "burner" });
    expect(out).toEqual({ status: "cancelled", reason: "confirm-required" });
    expect(send).not.toHaveBeenCalled();
  });

  it("declined confirmation cancels; approval sends with the same gas", async () => {
    const send = fakeSend(receipt("success"));
    expect(await runTx({ to: SENDER, data: "0x", gas: 30_000_000n, confirmGate: true }, { send, signerKind: "burner", confirm: () => false })).toEqual({
      status: "cancelled",
      reason: "declined",
    });
    const events: TxEvent[] = [];
    const out = await runTx(
      { to: SENDER, data: "0x12", gas: 30_000_000n, confirmGate: true },
      { send, signerKind: "burner", confirm: async (q) => q.payer === "sponsor", onEvent: (e) => events.push(e) },
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0].slice(0, 3)).toEqual([SENDER, "0x12", 30_000_000n]);
    expect(out).toMatchObject({ status: "confirmed", hash: HASH, ms: 321, sync: true });
    expect(events.map((e) => e.step)).toEqual(["funding", "sending", "confirmed"]);
    expect(events[0].raw).toBe(SIGNER_STATUS.funding);
  });

  it("reverted receipts and thrown errors become typed outcomes", async () => {
    const events: TxEvent[] = [];
    const rev = await runTx({ to: SENDER, data: "0x", gas: 80_000n, confirmGate: true }, { send: fakeSend(receipt("reverted")), signerKind: "burner", onEvent: (e) => events.push(e) });
    expect(rev).toMatchObject({ status: "reverted", hash: HASH });
    expect(events.at(-1)).toEqual({ step: "failed", detail: "reverted", raw: "" });

    const failing = vi.fn<SendFn>(async (_to, _data, _gas, onStatus) => {
      onStatus(SIGNER_STATUS.funding);
      throw new Error("sponsor bakiyesi yetersiz");
    });
    const out = await runTx({ to: SENDER, data: "0x", gas: 80_000n, confirmGate: false }, { send: failing });
    expect(out).toEqual({ status: "failed", error: { code: "funding-failed", detail: "sponsor-empty", raw: "sponsor bakiyesi yetersiz" } });
  });
});

describe("proveScenario (Protocol.tsx:247-274)", () => {
  it("simulate(scenario) on engineFor with the preview-sized limit; decodes SimulationDone", async () => {
    const [assetId, shockBps, liq, bad, rounds, used, gas, mem] = [9, 300, 133_890n, 0n, 1n, 57n, 387_554n, 29_632n];
    const log: Log = {
      address: DEPLOYMENT.contracts.kaskadMC!,
      topics: encodeEventTopics({ abi: kaskadAbi, eventName: "SimulationDone", args: { simId: SIM_ID, sender: SENDER } }) as [Hex, ...Hex[]],
      data: encodeAbiParameters(parseAbiParameters("uint16, uint16, uint256, uint256, uint256, uint256, uint256, uint256"), [assetId, shockBps, liq, bad, rounds, used, gas, mem]),
    };
    const send = fakeSend(receipt("success", [log]));
    const out = await proveScenario(sali.scenario, sali.result, { send, signerKind: "burner" });
    const [to, data, limit] = send.mock.calls[0];
    expect(to).toBe(DEPLOYMENT.contracts.kaskadMC);
    expect(limit).toBe(simulateGasLimit(sali.result.gasUsed, sali.result.rounds));
    expect(decodeFunctionData({ abi: kaskadAbi, data }).args).toEqual([sali.scenario]);
    expect(out).toMatchObject({ status: "confirmed", rounds: 1, simulationDone: { simId: SIM_ID, totalLiquidated: liq, positionsUsed: used, gasUsed: gas } });
  });

  it("reports a missing event as null", async () => {
    const out = await proveScenario(sali.scenario, sali.result, { send: fakeSend(receipt("success")), signerKind: "burner" });
    expect(out).toMatchObject({ status: "confirmed", simulationDone: null });
  });
});

describe("proveMonteCarlo (MonteCarlo.tsx:103-119)", () => {
  it("simulateMC(base, K, seed 1) on KaskadMC with monteCarloGasLimit", async () => {
    const preview = { gasUsed: 20_000_000n } as MonteCarloResult;
    const send = fakeSend(receipt("success"));
    const out = await proveMonteCarlo(sali.scenario, 30, preview, { send, signerKind: "burner", confirm: () => true });
    const [to, data, gas] = send.mock.calls[0];
    expect(to).toBe(DEPLOYMENT.contracts.kaskadMC);
    expect(gas).toBe(monteCarloGasLimit(20_000_000n));
    expect(decodeFunctionData({ abi: kaskadMCAbi, data }).args).toEqual([sali.scenario, 30n, 1n]);
    expect(out).toMatchObject({ status: "confirmed", paths: 30, monteCarloDone: null });
  });
});

describe("runGuard (GuardPanel.tsx:119-137)", () => {
  const worst = fixtureRun("worst");
  const reader = {
    readContract: vi.fn(async (req: { functionName: string; address: string }) => {
      if (req.functionName === "scenario") return worst.scenario;
      if (req.functionName === "borrowPaused") return req.address === DEPLOYMENT.contracts.marketB;
      if (req.functionName === "maxLtvBps") return 7_000;
      if (req.functionName === "totalBorrowed") return 0n;
      throw new Error(req.functionName);
    }),
    call: vi.fn(async () => ({ data: encodeFunctionResult({ abi: kaskadAbi, functionName: "preview", result: worst.result }) })),
  } as unknown as ChainReader;

  it("previews to size the tx, sends refresh(), decodes the Guard's own GuardChecked, re-reads markets", async () => {
    const guard = DEPLOYMENT.contracts.guard;
    const checkedTopics = encodeEventTopics({ abi: guardAbi, eventName: "GuardChecked", args: { simId: SIM_ID } }) as [Hex, ...Hex[]];
    const checkedData = encodeAbiParameters(parseAbiParameters("uint256, uint256, bool"), [9_371n, 222n, true]);
    const logs: Log[] = [
      { address: DEPLOYMENT.contracts.kaskad, topics: checkedTopics, data: checkedData }, // same shape, wrong emitter: skipped
      { address: guard, topics: checkedTopics, data: checkedData },
    ];
    const send = fakeSend(receipt("success", logs));
    const events: TxEvent[] = [];
    const out = await runGuard({ reader, send, signerKind: "burner", onEvent: (e) => events.push(e) });
    expect(events[0]).toEqual({ step: "preparing", detail: "guard-scenario", raw: "" });
    const [to, data, gas] = send.mock.calls[0];
    expect(to).toBe(guard);
    expect(decodeFunctionData({ abi: guardAbi, data }).functionName).toBe("refresh");
    expect(gas).toBe(simulateGasLimit(worst.result.gasUsed, worst.result.rounds) + GUARD_TX_OVERHEAD_GAS);
    expect(out).toMatchObject({
      status: "confirmed",
      checked: { simId: SIM_ID, badDebtRatioBps: 9_371n, liquidationRatioBps: 222n, tripped: true },
      markets: { a: { paused: false }, b: { paused: true, maxLtvBps: 7_000 } },
    });
  });

  it("a failed preview fails before sending", async () => {
    const broken = { readContract: vi.fn(async () => worst.scenario), call: vi.fn(async () => ({})) } as unknown as ChainReader;
    const send = fakeSend(receipt("success"));
    const out = await runGuard({ reader: broken, send, signerKind: "burner" });
    expect(out).toMatchObject({ status: "failed", error: { code: "unknown", raw: "empty eth_call result" } });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("borrow (GuardPanel.tsx:139-163)", () => {
  it("a paused market fails the free pre-check: borrow-paused, nothing sent", async () => {
    const reader = {
      simulateContract: vi.fn(async () => {
        throw new Error('The contract function "borrow" reverted.\n\nError: BorrowIsPaused()');
      }),
    } as unknown as ChainReader;
    const send = fakeSend(receipt("success"));
    const out = await borrow(DEPLOYMENT.contracts.marketB, { reader, send, account: SENDER });
    expect(out).toMatchObject({ status: "failed", error: { code: "borrow-paused" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("an open market: borrow(1,000e18) with 80k gas, no confirmation, markets re-read", async () => {
    const simulateContract = vi.fn(async () => ({ result: undefined }));
    const reader = {
      simulateContract,
      readContract: vi.fn(async (req: { functionName: string }) => (req.functionName === "borrowPaused" ? false : req.functionName === "maxLtvBps" ? 9_000 : 1n)),
    } as unknown as ChainReader;
    const send = fakeSend(receipt("success"));
    const out = await borrow(DEPLOYMENT.contracts.marketA, { reader, send, account: SENDER });
    expect(simulateContract).toHaveBeenCalledWith(expect.objectContaining({ account: SENDER, address: DEPLOYMENT.contracts.marketA, functionName: "borrow", args: [BORROW_AMOUNT] }));
    const [to, data, gas] = send.mock.calls[0];
    expect([to, gas]).toEqual([DEPLOYMENT.contracts.marketA, BORROW_GAS]);
    expect(decodeFunctionData({ abi: mockMarketAbi, data }).args).toEqual([BORROW_AMOUNT]);
    expect(out).toMatchObject({ status: "confirmed", amount: BORROW_AMOUNT, markets: { a: { paused: false, maxLtvBps: 9_000 } } });
  });
});
