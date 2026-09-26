// Smoke test against the deployment: free previews, optionally real simulate() txs.
//   npm run smoke               -> previews only
//   npm run smoke -- --send     -> also sends simulate() txs from the deployer (proof links)
//   npm run smoke -- --guard    -> also calls Guard.refresh()
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, encodeFunctionData, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { requireEnv } from "./lib/env.js";
import { kaskadAbi, guardAbi, mockMarketAbi } from "../../web/lib/kaskad/abi.js";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "../../web/lib/kaskad/tx.js";
import { ethMemoryGas, simulateGasLimit } from "../../web/lib/kaskad/math.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dep = JSON.parse(readFileSync(join(root, "contracts/deployments/testnet.json"), "utf8")) as Record<string, Address>;
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(requireEnv("MONAD_TESTNET_RPC"), { timeout: 60_000 }),
}) as PublicClient;
const account = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);
const SEND = process.argv.includes("--send");
const GUARD = process.argv.includes("--guard");
const usd = (w: bigint) => `$${(Number(w / 10n ** 12n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

type Sc = {
  assetId: number;
  shockBps: number;
  steps: number;
  maxRoundsPerStep: number;
  maxPositions: number;
  oracleFeedbackBps: number;
};
const sc = (assetId: number, shockBps: number, maxPositions: number, oracleFeedbackBps = 10_000): Sc => ({
  assetId,
  shockBps,
  steps: 20,
  maxRoundsPerStep: 3,
  maxPositions,
  oracleFeedbackBps,
});
const scenarios: [string, Sc][] = [
  ["syrupUSDC gerçek −3%, piyasa oracle'ı", sc(9, 300, 57)],
  ["syrupUSDC gerçek −3%, kur oracle'ı", sc(9, 300, 57, 0)],
  ["syrupUSDC gerçek −12%, kur oracle'ı", sc(9, 1200, 57, 0)],
  ["PT-AUSD gerçek −2%, piyasa oracle'ı", sc(12, 200, 50)],
  ["syrupUSDC kalibre 2k −3%", sc(265, 300, 2000)],
  ["syrupUSDC kalibre 10k −3%", sc(265, 300, 10000)],
];

let nonce = 0;
async function sendTx(to: Address, data: Hex, gas: bigint) {
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
  return sendRawSync(client, raw, 30_000);
}

async function main() {
  nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
  for (const [name, s] of scenarios) {
    const t0 = Date.now();
    const r = await client.readContract({ address: dep.kaskad, abi: kaskadAbi, functionName: "preview", args: [s] });
    console.log(`\n${name}  (preview ${Date.now() - t0} ms)`);
    console.log(
      `  debt ${usd(r.totalDebt)}  liquidated ${usd(r.totalLiquidated)}  BAD DEBT ${usd(r.badDebt)}  stuck ${usd(r.stuckDebt)}  ` +
        `price ${(Number(r.startPrice) / 1e18).toFixed(4)} -> ${(Number(r.finalPrice) / 1e18).toFixed(4)}`,
    );
    console.log(
      `  rounds ${r.rounds}  liquidations ${r.liquidations}  engine gas ${r.gasUsed}  memory ${r.memoryBytes} B  ` +
        `(Ethereum memory gas for same: ${ethMemoryGas(Number(r.memoryBytes))})`,
    );
    if (SEND) {
      const gas = simulateGasLimit(r.gasUsed, r.rounds);
      const data = encodeFunctionData({ abi: kaskadAbi, functionName: "simulate", args: [s] });
      const { receipt, sync, ms } = await sendTx(dep.kaskad, data, gas);
      console.log(
        `  simulate tx ${receipt.status} gasUsed=${receipt.gasUsed} limit=${gas} ${sync ? "sync" : "async"} ${ms}ms`,
      );
      console.log(`  https://testnet.monadscan.com/tx/${receipt.transactionHash}`);
    }
  }
  if (GUARD) {
    const data = encodeFunctionData({ abi: guardAbi, functionName: "refresh" });
    const est = await client.estimateGas({ account: account.address, to: dep.guard, data });
    const { receipt } = await sendTx(dep.guard, data, (est * 12n) / 10n);
    const paused = await client.readContract({ address: dep.marketB, abi: mockMarketAbi, functionName: "borrowPaused" });
    console.log(`\nGuard.refresh ${receipt.status} gasUsed=${receipt.gasUsed} -> marketB paused: ${paused}`);
    console.log(`  https://testnet.monadscan.com/tx/${receipt.transactionHash}`);
  }
}

main().catch((e) => {
  console.error(String(e?.shortMessage ?? e?.message ?? e).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
