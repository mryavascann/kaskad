import { describe, expect } from "bun:test";
import { addContractMock, EvmMock, newTestRuntime, REPORT_METADATA_HEADER_LENGTH, test } from "@chainlink/cre-sdk/test";
import { decodeAbiParameters, type Hex, bytesToHex } from "viem";
import { guardV2Abi, kaskadAbi, kaskadMCv3Abi, mockMarketV2Abi, mockUSDAbi, riskOracleAbi, riskVaultAbi } from "./abi";
import config from "./config.staging.json";
import { BOOK_EVENTS, type Config, initWorkflow, onBookEvent, onCron } from "./workflow";

const MONAD_TESTNET = 2183018362218727504n;
const WAD = 10n ** 18n;
const T = 1_791_042_926;
const RECEIVER = "0x00000000000000000000000000000000000000c1" as const;
const KUSD = "0x211Ed739699eAdfeA64AB08f7284F3aAE4467714" as const;
const cfg: Config = { ...config, contracts: { ...config.contracts, receiver: RECEIVER } };
const [SYRUP_MARKET, WETH_MARKET] = cfg.contracts.markets.map((m) => m.address as Hex);

const rule = {
  enabled: true,
  steps: 20,
  rounds: 3,
  maxPositions: 0,
  oracleFeedbackBps: 0,
  triggerShockBps: 1_000,
  lossThresholdBps: 100,
  stuckThresholdBps: 2_000,
  ltvFloorBps: 7_000,
  ltvCeilingBps: 9_000,
  ltvStepBps: 500,
  minInterval: 600,
};
const result = (debt: bigint, bad: bigint, stuck: bigint) => ({
  totalDebt: debt * WAD,
  totalCollateral: 0n,
  totalLiquidated: 0n,
  totalSeized: 0n,
  badDebt: bad * WAD,
  stuckDebt: stuck * WAD,
  startPrice: WAD,
  finalPrice: WAD,
  rounds: 1,
  liquidations: 0,
  positionsUsed: 0,
  gasUsed: 0n,
  memoryBytes: 0n,
  log: [],
});
const hidden = (h: bigint) => ({ oraclePrice: WAD, spotPrice: WAD, badDebtAtSpot: 0n, stuckDebtAtSpot: 0n, hiddenBadDebt: h * WAD });

type World = { syrupStored: boolean; syrupPreviewRisky: boolean; syrupPaused: boolean };

/** The testnet system after the first demo run, with knobs. Returns the captured report payloads. */
function mockChain(w: World) {
  const evm = EvmMock.testInstance(MONAD_TESTNET);
  const c = cfg.contracts;
  const kaskad = addContractMock(evm, { address: c.kaskad as Hex, abi: kaskadAbi });
  kaskad.bookStats = (id: unknown) => [0n, 0n, 0n, id === 9n ? 57 : 42];
  const mc = addContractMock(evm, { address: c.kaskadMCv3 as Hex, abi: kaskadMCv3Abi });
  mc.previewWithHidden = (s: unknown) =>
    (s as { assetId: number }).assetId === 9 && w.syrupPreviewRisky
      ? [result(123_685_701n, 17_749n, 96_777_238n), hidden(8_817_433n)]
      : [result(1_000_000n, 0n, 0n), hidden(0n)];
  const oracle = addContractMock(evm, { address: c.riskOracle as Hex, abi: riskOracleAbi });
  oracle.rule = () => rule;
  oracle.state = (id: unknown) => (id === 9n ? [w.syrupStored, w.syrupStored ? 8_500 : 9_000, BigInt(T), 0, 0] : [false, 9_000, BigInt(T), 0, 0]);
  const guard = addContractMock(evm, { address: c.guardV2 as Hex, abi: guardV2Abi });
  guard.lastAtRisk = () => BigInt(T);
  guard.recoveryDelay = () => 1_800;
  for (const [m, paused, deposit] of [
    [SYRUP_MARKET, w.syrupPaused, 0n],
    [WETH_MARKET, false, 10n ** 12n],
  ] as const) {
    const mm = addContractMock(evm, { address: m, abi: mockMarketV2Abi });
    mm.borrowPaused = () => paused;
    mm.deposits = () => deposit;
  }
  const vault = addContractMock(evm, { address: c.riskVault as Hex, abi: riskVaultAbi });
  vault.flagged = (m: unknown) => (m as string).toLowerCase() === SYRUP_MARKET.toLowerCase() && w.syrupStored;
  vault.asset = () => KUSD;
  addContractMock(evm, { address: KUSD, abi: mockUSDAbi }).balanceOf = () => 0n;

  const sent: { payload: Hex; gasLimit: bigint }[] = [];
  addContractMock(evm, { address: RECEIVER, abi: [] }).writeReport = ({ report, gasConfig }) => {
    // The raw report is the metadata header followed by our payload.
    const raw = bytesToHex(report.rawReport);
    sent.push({ payload: `0x${raw.slice(2 + REPORT_METADATA_HEADER_LENGTH * 2)}` as Hex, gasLimit: BigInt(gasConfig.gasLimit) });
    return { txStatus: "TX_STATUS_SUCCESS", txHash: Buffer.from("ab".repeat(32), "hex").toString("base64") } as never;
  };
  return sent;
}

const decode = (payload: Hex) =>
  decodeAbiParameters(
    [{ type: "tuple", components: [{ name: "publish", type: "uint16[]" }, { name: "refreshGuard", type: "bool" }, { name: "rebalanceVault", type: "bool" }, { name: "reason", type: "uint8" }] }],
    payload,
  )[0];

const runtimeAt = (sec: number) => newTestRuntime<Config>(null, { timeProvider: () => sec * 1000 }, cfg);

describe("kaskad-risk workflow", () => {
  test("steady testnet state: reads everything, sends nothing", () => {
    const sent = mockChain({ syrupStored: true, syrupPreviewRisky: true, syrupPaused: true });
    const runtime = runtimeAt(T + 3_600);
    expect(onCron(runtime)).toBe("noop");
    expect(sent).toHaveLength(0);
    const logs = runtime.getLogs().join("\n");
    expect(logs).toContain("asset 9: -10% preview bad $17.7K, hidden $8.8M, stuck $96.8M of $123.7M -> loss 7.1%, stuck 78.2%, AT RISK");
    expect(logs).toContain("no report");
  });

  test("the preview turns risky: one report publishes syrupUSDC, then guard and vault", () => {
    const sent = mockChain({ syrupStored: false, syrupPreviewRisky: true, syrupPaused: false });
    const runtime = runtimeAt(T + 3_600);
    expect(onCron(runtime)).toStartWith("sent flip 0xabab");
    expect(sent).toHaveLength(1);
    expect(decode(sent[0].payload)).toEqual({ publish: [9], refreshGuard: true, rebalanceVault: true, reason: 2 });
    expect(sent[0].gasLimit).toBe(500_000n + 2_300_000n + 250_000n + 350_000n);
  });

  test("a Kaskad book event re-publishes that asset; an unwatched one is ignored", () => {
    const sent = mockChain({ syrupStored: true, syrupPreviewRisky: true, syrupPaused: true });
    const topic = (id: bigint) => new Uint8Array(Buffer.from(id.toString(16).padStart(64, "0"), "hex"));
    expect(onBookEvent(runtimeAt(T + 3_600), { topics: [new Uint8Array(32), topic(5n)] })).toStartWith("sent bookChanged");
    expect(decode(sent[0].payload)).toMatchObject({ publish: [5], reason: 4 });
    expect(onBookEvent(runtimeAt(T + 3_600), { topics: [new Uint8Array(32), topic(12n)] })).toBe("ignored");
  });

  test("two triggers: the cron schedule and Kaskad's book events", () => {
    const handlers = initWorkflow(cfg);
    expect(handlers).toHaveLength(2);
    expect(handlers[0].trigger.config.schedule).toBe(cfg.schedule);
    expect(BOOK_EVENTS).toHaveLength(3);
  });
});
