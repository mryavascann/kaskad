// One-off measurement run for the presentation: every number printed here is read from chain.
//   npx tsx src/measure-all.ts            (sends 2 simulate + 2 simulateMC txs from the deployer)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { requireEnv } from "./lib/env.js";
import { guardAbi, kaskadMCAbi, mockMarketAbi } from "../../web/lib/kaskad/abi.js";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "../../web/lib/kaskad/tx.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dep = JSON.parse(readFileSync(join(root, "contracts/deployments/testnet.json"), "utf8")) as Record<string, Address>;
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(requireEnv("MONAD_TESTNET_RPC"), { timeout: 120_000 }),
}) as PublicClient;
const account = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);
const usd = (w: bigint) => `$${(Number(w / 10n ** 12n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const mon = (w: bigint) => (Number(w) / 1e18).toFixed(4);
const latencies: number[] = [];
let nonce = 0;

async function send(to: Address, data: Hex, gas: bigint) {
  const raw = await account.signTransaction({
    chainId: monadTestnet.id,
    type: "eip1559",
    to,
    data,
    gas,
    nonce: nonce++,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  });
  const r = await sendRawSync(client as never, raw, 60_000);
  latencies.push(r.ms);
  return r;
}

async function mcPreview(s: object, k: number, cap: bigint) {
  try {
    const data = encodeFunctionData({ abi: kaskadMCAbi, functionName: "previewMC", args: [s as never, BigInt(k), 1n] });
    const res = await client.call({ to: dep.kaskadMC, data, gas: cap });
    return decodeFunctionResult({ abi: kaskadMCAbi, functionName: "previewMC", data: res.data! }) as any;
  } catch {
    return null;
  }
}

async function main() {
  // ---------------------------------------------------------------- A1
  const d = JSON.parse(readFileSync(join(root, "scripts/data/positions.json"), "utf8"));
  const ps = d.positions.filter((p: any) => p.debtUsd > 0);
  const syrup = ps.filter((p: any) => p.collateralId === 9);
  const sum = (xs: any[], k: string) => xs.reduce((s, p) => s + p[k] + (k === "collateralUsd" ? p.otherCollateralUsd : 0), 0);
  const big = [...syrup].sort((a: any, b: any) => b.debtUsd - a.debtUsd)[0];
  console.log(`A1 block ${d.block}: positions ${ps.length}, collateral $${sum(ps, "collateralUsd").toFixed(0)}, debt $${sum(ps, "debtUsd").toFixed(0)}`);
  console.log(`A1 syrupUSDC: positions ${syrup.length}, collateral $${sum(syrup, "collateralUsd").toFixed(0)}, debt $${sum(syrup, "debtUsd").toFixed(0)}`);
  console.log(`A1 largest: ${big.user.slice(0, 6)}…${big.user.slice(-4)} debt $${big.debtUsd.toFixed(0)} = ${((big.debtUsd / sum(syrup, "debtUsd")) * 100).toFixed(1)}% of syrup debt, collateral share ${((big.collateralUsd / syrup.reduce((s: number, p: any) => s + p.collateralUsd, 0)) * 100).toFixed(1)}%`);

  const balBefore = await client.getBalance({ address: account.address });
  nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });

  // ---------------------------------------------------------------- A2
  for (const fb of [0, 10_000]) {
    const s = { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: fb };
    const p = (await client.readContract({ address: dep.kaskadMC, abi: kaskadMCAbi, functionName: "preview", args: [s] })) as any;
    const gas = (p.gasUsed * 115n) / 100n + BigInt(p.rounds) * 4_000n + 250_000n;
    const { receipt, ms, sync } = await send(dep.kaskadMC, encodeFunctionData({ abi: kaskadMCAbi, functionName: "simulate", args: [s] }), gas);
    console.log(
      `A2 fb=${fb}: status ${receipt.status} liquidated ${usd(p.totalLiquidated)} badDebt ${usd(p.badDebt)} stuck ${usd(p.stuckDebt)} rounds ${p.rounds} liquidations ${p.liquidations} engineGas ${p.gasUsed} txGasLimit(charged) ${receipt.gasUsed} ${sync ? "sync" : "async"} ${ms}ms tx ${receipt.transactionHash}`,
    );
  }

  // ---------------------------------------------------------------- A3
  const CAP = 29_500_000n; // leave room for tx overhead + events under the 30M tx limit
  for (const fb of [0, 10_000]) {
    const s = { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: fb };
    let lo = 0;
    let hi = 2_000;
    let best: any = null;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const r = await mcPreview(s, mid, CAP);
      if (r) {
        lo = mid;
        best = r;
      } else hi = mid - 1;
    }
    const { receipt, ms } = await send(
      dep.kaskadMC,
      encodeFunctionData({ abi: kaskadMCAbi, functionName: "simulateMC", args: [s, BigInt(lo), 1n] }),
      30_000_000n,
    );
    const cost = receipt.gasUsed * receipt.effectiveGasPrice;
    console.log(
      `A3 fb=${fb}: K=${lo} mean ${usd(best.meanBadDebt)} p95 ${usd(best.p95BadDebt)} worst ${usd(best.worstBadDebt)} (worst path shock ${Number(best.worstShockBps) / 100}%) lossPaths ${best.lossPaths}/${lo} engineGas ${best.gasUsed} memory ${best.memoryBytes}B status ${receipt.status} charged ${receipt.gasUsed} gas = ${mon(cost)} MON ${ms}ms tx ${receipt.transactionHash}`,
    );
  }

  // ---------------------------------------------------------------- C6
  for (const [name, a] of Object.entries(dep)) {
    if (typeof a !== "string" || !a.startsWith("0x")) continue;
    const code = await client.getCode({ address: a as Address });
    console.log(`C6 ${name} ${a}: ${code ? (code.length - 2) / 2 : 0} bytes`);
  }

  // ---------------------------------------------------------------- D10
  const sc = (await client.readContract({ address: dep.guard, abi: guardAbi, functionName: "scenario" })) as any;
  const [bad, liq, safe, paused] = await Promise.all([
    client.readContract({ address: dep.guard, abi: guardAbi, functionName: "badDebtThresholdBps" }),
    client.readContract({ address: dep.guard, abi: guardAbi, functionName: "liquidationThresholdBps" }),
    client.readContract({ address: dep.guard, abi: guardAbi, functionName: "safeLtvBps" }),
    client.readContract({ address: dep.marketB, abi: mockMarketAbi, functionName: "borrowPaused" }),
  ]);
  console.log(`D10 guard scenario ${JSON.stringify(sc)} badDebtThresholdBps ${bad} liqThresholdBps ${liq} safeLtvBps ${safe}; marketB paused now: ${paused}`);

  // ---------------------------------------------------------------- C7 / C8
  const balAfter = await client.getBalance({ address: account.address });
  const sponsor = await client.getBalance({ address: requireEnv("SPONSOR_ADDRESS") as Address });
  console.log(`C7 sync latencies ms: ${latencies.join(", ")}; mean ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)}`);
  console.log(`C8 deployer ${mon(balAfter)} MON (spent this run ${mon(balBefore - balAfter)}), sponsor ${mon(sponsor)} MON`);
}

main().catch((e) => {
  console.error(String(e?.shortMessage ?? e?.message ?? e).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
