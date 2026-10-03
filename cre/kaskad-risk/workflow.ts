// Kaskad risk workflow (Chainlink CRE), entry: main.ts: orchestrates RiskOracle -> GuardV2 -> RiskVault on Monad.
//
// Triggers: a cron schedule, and Kaskad's own book events (AssetSet / PositionsLoaded / BookReset),
// so a price or book change is re-assessed right away. Each run reads everything for free
// (two finalized Multicall3 eth_calls through the EVM capability), previews the rule's trigger shock on
// KaskadMCv3, decides with decide.ts and sends ONE report only when it changes something. The report
// lands in KaskadCREReceiver, which runs publish() for the assets that need it, then GuardV2.refresh()
// and RiskVault.rebalance().

import {
  bytesToHex,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  handler,
  LAST_FINALIZED_BLOCK_NUMBER,
  logTriggerConfig,
  prepareReportRequest,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Abi, type Address, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, type Hex, toEventSelector, zeroAddress } from "viem";
import { z } from "zod";
import { guardV2Abi, kaskadAbi, kaskadMCv3Abi, mockMarketV2Abi, mockUSDAbi, riskOracleAbi, riskVaultAbi } from "./abi";
import { type AssetView, type MarketView, type Plan, plan, REASON, reportGasLimit } from "./decide";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  /** Kaskad asset ids RiskOracle has a rule for. */
  assets: z.array(z.number().int().min(0).max(255)),
  /** Re-publish a steady asset after this long (below GuardV2 / RiskVault maxReportAge). */
  refreshAfterSec: z.number().int().positive(),
  contracts: z.object({
    kaskad: address,
    kaskadMCv3: address,
    multicall3: address,
    riskOracle: address,
    guardV2: address,
    riskVault: address,
    receiver: address,
    markets: z.array(z.object({ address, assetId: z.number().int() })),
  }),
  gas: z.object({ base: z.string(), perPublish: z.string(), guard: z.string(), vault: z.string() }),
});
export type Config = z.infer<typeof configSchema>;

/** KaskadCREReceiver.Instruction */
const INSTRUCTION = [
  {
    type: "tuple",
    components: [
      { name: "publish", type: "uint16[]" },
      { name: "refreshGuard", type: "bool" },
      { name: "rebalanceVault", type: "bool" },
      { name: "reason", type: "uint8" },
    ],
  },
] as const;

/** Kaskad book events that make a stored report outdated (PositionBook.sol). */
export const BOOK_EVENTS: Hex[] = [
  toEventSelector("AssetSet(uint256,uint256,uint256)"),
  toEventSelector("PositionsLoaded(uint256,uint256,uint256)"),
  toEventSelector("BookReset(uint256)"),
];

const WAD = 10n ** 18n;
const usd = (wad: bigint) => {
  const d = Number(wad / WAD);
  return d >= 1e6 ? `$${(d / 1e6).toFixed(1)}M` : d >= 1e3 ? `$${(d / 1e3).toFixed(1)}K` : `$${d}`;
};
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

const evmFor = (config: Config) => {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`);
  return new EVMClient(network.chainSelector.selector);
};

/** Multicall3.aggregate3, declared view: the workflow only eth_calls it. */
export const MULTICALL3_ABI = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "view",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

type Call = { to: string; abi: Abi; functionName: string; args?: readonly unknown[] };

/**
 * Many reads in ONE finalized eth_call through Multicall3: production allows 15 chain reads per
 * execution, and a run needs ~19 values. Results are decoded with each call's own ABI.
 */
function readAll(runtime: Runtime<Config>, evm: EVMClient, calls: readonly Call[]): unknown[] {
  const data = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [
      calls.map((c) => ({
        target: c.to as Address,
        allowFailure: false,
        callData: encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args ?? [] } as never),
      })),
    ],
  });
  const reply = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: runtime.config.contracts.multicall3 as Address, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const results = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", data: bytesToHex(reply.data) });
  return results.map((r, i) => decodeFunctionResult({ abi: calls[i].abi, functionName: calls[i].functionName, data: r.returnData } as never));
}

type RuleOut = {
  enabled: boolean;
  steps: number;
  rounds: number;
  maxPositions: number;
  oracleFeedbackBps: number;
  triggerShockBps: number;
  lossThresholdBps: number;
  stuckThresholdBps: number;
  minInterval: number;
};
type StateOut = readonly [boolean, number, bigint, number, number];
type StatsOut = readonly [bigint, bigint, bigint, number];
type ResultOut = { totalDebt: bigint; badDebt: bigint; stuckDebt: bigint };
type HiddenOut = { hiddenBadDebt: bigint };

/** Reads, decides, and sends the report when the plan does anything. Returns a one-line summary. */
export function assess(runtime: Runtime<Config>, changed: ReadonlySet<number> = new Set()): string {
  const cfg = runtime.config;
  const c = cfg.contracts;
  const evm = evmFor(cfg);
  const nowSec = Math.floor(runtime.now().getTime() / 1000);

  // Read 1: rules, states, book sizes, markets, vault token, recovery delay.
  const one = readAll(runtime, evm, [
    ...cfg.assets.flatMap((id): Call[] => [
      { to: c.riskOracle, abi: riskOracleAbi, functionName: "rule", args: [id] },
      { to: c.riskOracle, abi: riskOracleAbi, functionName: "state", args: [BigInt(id)] },
      { to: c.kaskad, abi: kaskadAbi, functionName: "bookStats", args: [BigInt(id)] },
    ]),
    ...c.markets.flatMap((m): Call[] => [
      { to: m.address, abi: mockMarketV2Abi, functionName: "borrowPaused" },
      { to: c.guardV2, abi: guardV2Abi, functionName: "lastAtRisk", args: [m.address] },
      { to: c.riskVault, abi: riskVaultAbi, functionName: "flagged", args: [m.address] },
      { to: m.address, abi: mockMarketV2Abi, functionName: "deposits", args: [c.riskVault] },
    ]),
    { to: c.riskVault, abi: riskVaultAbi, functionName: "asset" },
    { to: c.guardV2, abi: guardV2Abi, functionName: "recoveryDelay" },
  ]);
  const A = cfg.assets.length;
  const rules = cfg.assets.map((_, i) => one[i * 3] as RuleOut);
  const states = cfg.assets.map((_, i) => one[i * 3 + 1] as StateOut);
  const sizes = cfg.assets.map((_, i) => (one[i * 3 + 2] as StatsOut)[3]);
  const markets: MarketView[] = c.markets.map((m, j) => {
    const k = A * 3 + j * 4;
    return {
      address: m.address,
      assetId: m.assetId,
      paused: one[k] as boolean,
      lastAtRisk: Number(one[k + 1] as bigint),
      flagged: one[k + 2] as boolean,
      vaultDeposit: one[k + 3] as bigint,
    };
  });
  const token = one[A * 3 + c.markets.length * 4] as Address;
  const recoveryDelay = Number(one[A * 3 + c.markets.length * 4 + 1]);

  // Read 2: each rule's trigger-shock preview on KaskadMCv3, and the vault's idle balance.
  const two = readAll(runtime, evm, [
    ...cfg.assets.map(
      (assetId, i): Call => ({
        to: c.kaskadMCv3,
        abi: kaskadMCv3Abi,
        functionName: "previewWithHidden",
        args: [
          {
            assetId,
            shockBps: rules[i].triggerShockBps,
            steps: rules[i].steps,
            maxRoundsPerStep: rules[i].rounds,
            maxPositions: rules[i].maxPositions === 0 ? sizes[i] : rules[i].maxPositions,
            oracleFeedbackBps: rules[i].oracleFeedbackBps,
          },
        ],
      }),
    ),
    { to: token, abi: mockUSDAbi, functionName: "balanceOf", args: [c.riskVault] },
  ]);
  const assets: AssetView[] = cfg.assets.map((assetId, i) => {
    const [res, hidden] = two[i] as readonly [ResultOut, HiddenOut];
    const [atRisk, recommendedLtvBps, lastPublished] = states[i];
    return {
      assetId,
      rule: rules[i],
      state: { atRisk, recommendedLtvBps, lastPublished: Number(lastPublished) },
      preview: { totalDebt: res.totalDebt, badDebt: res.badDebt, stuckDebt: res.stuckDebt, hiddenBadDebt: hidden.hiddenBadDebt },
    };
  });
  const vaultIdle = two[A] as bigint;

  const p = plan({ assets, markets, vaultIdle, recoveryDelay, nowSec, refreshAfter: cfg.refreshAfterSec, changed });
  for (const a of assets) {
    const d = p.assets.find((x) => x.assetId === a.assetId)!;
    runtime.log(
      `asset ${a.assetId}: -${pct(a.rule.triggerShockBps)} preview bad ${usd(a.preview.badDebt)}, hidden ${usd(a.preview.hiddenBadDebt)}, ` +
        `stuck ${usd(a.preview.stuckDebt)} of ${usd(a.preview.totalDebt)} -> loss ${pct(d.predicted.lossBps)}, stuck ${pct(d.predicted.stuckBps)}, ` +
        `${d.predicted.atRisk ? "AT RISK" : "clear"} (stored: ${a.state.lastPublished === 0 ? "none" : a.state.atRisk ? "at risk" : "clear"}, LTV ${pct(a.state.recommendedLtvBps)}) ` +
        `=> ${d.publish ? `publish (${reasonName(d.why as number)})` : d.why === "cooldown" ? `wait ${d.cooldownLeft}s (cooldown)` : d.why}`,
    );
  }
  for (const m of markets) {
    runtime.log(`market ${m.address} (asset ${m.assetId}): ${m.paused ? "paused" : "open"}, vault ${m.flagged ? "keeps out" : "may lend"}, vault deposit ${m.vaultDeposit}`);
  }

  if (p.reason === REASON.none) {
    runtime.log("no report: oracle, guard and vault already agree with the books");
    return "noop";
  }
  return send(runtime, evm, p);
}

const REASON_NAMES = ["none", "first", "flip", "stale", "bookChanged", "sync"] as const;
function reasonName(r: number): string {
  return REASON_NAMES[r] ?? String(r);
}

function send(runtime: Runtime<Config>, evm: EVMClient, p: Plan): string {
  const cfg = runtime.config;
  const payload = encodeAbiParameters(INSTRUCTION, [
    { publish: p.publish, refreshGuard: p.refreshGuard, rebalanceVault: p.rebalanceVault, reason: p.reason },
  ]);
  const gasLimit = reportGasLimit(p, {
    base: BigInt(cfg.gas.base),
    perPublish: BigInt(cfg.gas.perPublish),
    guard: BigInt(cfg.gas.guard),
    vault: BigInt(cfg.gas.vault),
  });
  runtime.log(
    `report (${reasonName(p.reason)}): publish [${p.publish.join(", ")}], guard ${p.refreshGuard}, vault ${p.rebalanceVault}, gas limit ${gasLimit}`,
  );
  const report = runtime.report(prepareReportRequest(payload)).result();
  const reply = evm.writeReport(runtime, { receiver: cfg.contracts.receiver, report, gasConfig: { gasLimit: gasLimit.toString() } }).result();
  if (reply.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${reply.errorMessage || reply.txStatus}`);
  const hash = reply.txHash ? bytesToHex(reply.txHash) : "(no hash)";
  runtime.log(`report written: ${hash}`);
  return `sent ${reasonName(p.reason)} ${hash}`;
}

export const onCron = (runtime: Runtime<Config>): string => assess(runtime);

/** A Kaskad book event: re-assess now, treating that asset's stored report as outdated. */
export const onBookEvent = (runtime: Runtime<Config>, log: { topics: Uint8Array[] }): string => {
  const assetId = Number(BigInt(bytesToHex(log.topics[1])) & 0xffn);
  if (!runtime.config.assets.includes(assetId)) {
    runtime.log(`book event for asset ${assetId}: not watched`);
    return "ignored";
  }
  runtime.log(`book event for asset ${assetId}: re-assessing`);
  return assess(runtime, new Set([assetId]));
};

export const initWorkflow = (config: Config) => {
  const evm = evmFor(config);
  return [
    handler(new CronCapability().trigger({ schedule: config.schedule }), onCron),
    handler(evm.logTrigger(logTriggerConfig({ addresses: [config.contracts.kaskad as Hex], topics: [BOOK_EVENTS], confidence: "FINALIZED" })), onBookEvent),
  ];
};

