// Owner-only: writes RECOVERY_BPS (web/lib/kaskad/recovery.ts) to KaskadMC. Skips values already set.
//   npm run set-recovery
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, encodeFunctionData, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { requireEnv } from "./lib/env.js";
import { kaskadMCAbi } from "../../web/lib/kaskad/abi.js";
import { RECOVERY_BPS } from "../../web/lib/kaskad/recovery.js";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "../../web/lib/kaskad/tx.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dep = JSON.parse(readFileSync(join(root, "contracts/deployments/testnet.json"), "utf8")) as Record<string, Address>;
const client = createPublicClient({ chain: monadTestnet, transport: http(requireEnv("MONAD_TESTNET_RPC")) }) as PublicClient;
const account = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);

async function main() {
  let nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });
  for (const [id, { bps }] of Object.entries(RECOVERY_BPS)) {
    const cur = await client.readContract({
      address: dep.kaskadMC,
      abi: kaskadMCAbi,
      functionName: "recoveryBps",
      args: [BigInt(id)],
    });
    if (Number(cur) === bps) continue;
    const raw = await account.signTransaction({
      chainId: monadTestnet.id,
      type: "eip1559",
      to: dep.kaskadMC,
      data: encodeFunctionData({ abi: kaskadMCAbi, functionName: "setRecovery", args: [BigInt(id), bps] }),
      gas: 60_000n,
      nonce: nonce++,
      maxFeePerGas: MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    });
    const { receipt } = await sendRawSync(client as never, raw);
    console.log(`asset ${id} -> ${bps} bps: ${receipt.status}`);
  }
}

main().catch((e) => {
  console.error(String(e?.shortMessage ?? e?.message ?? e).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
