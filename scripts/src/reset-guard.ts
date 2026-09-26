// Owner-only: re-opens Market B after a Guard trip so the demo can be run again.
//   npm run reset-guard
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, encodeFunctionData, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { requireEnv } from "./lib/env.js";
import { mockMarketAbi } from "../../web/lib/kaskad/abi.js";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "../../web/lib/kaskad/tx.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dep = JSON.parse(readFileSync(join(root, "contracts/deployments/testnet.json"), "utf8")) as Record<string, Address>;
const client = createPublicClient({ chain: monadTestnet, transport: http(requireEnv("MONAD_TESTNET_RPC")) }) as PublicClient;
const account = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);

async function main() {
  let nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
  const calls = [
    encodeFunctionData({ abi: mockMarketAbi, functionName: "setBorrowPaused", args: [false] }),
    encodeFunctionData({ abi: mockMarketAbi, functionName: "setMaxLtv", args: [9000] }),
  ];
  for (const data of calls) {
    const raw = await account.signTransaction({
      chainId: monadTestnet.id,
      type: "eip1559",
      to: dep.marketB,
      data,
      gas: 60_000n,
      nonce: nonce++,
      maxFeePerGas: MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    });
    const { receipt } = await sendRawSync(client as never, raw);
    console.log(`${receipt.status} ${receipt.transactionHash}`);
  }
  const paused = await client.readContract({ address: dep.marketB, abi: mockMarketAbi, functionName: "borrowPaused" });
  console.log(`marketB paused: ${paused}`);
}

main().catch((e) => {
  console.error(String(e?.shortMessage ?? e?.message ?? e).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
