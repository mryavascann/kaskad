// Loads Aave Monad positions into the testnet Kaskad deployment and writes the web config.
//   npm run load                 -> dry run: prints the plan and the MON cost estimate
//   npm run load -- --yes        -> sends the transactions
//   --cal 9:10000,12:2000        -> calibrated book sizes per asset (default below)
// Idempotent: books already at the target length are skipped, partial books resume.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseGwei,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { requireEnv } from "./lib/env.js";
import { kaskadAbi, guardAbi } from "../../web/lib/kaskad/abi.js";
import { packPosition } from "../../web/lib/kaskad/pack.js";
import { calibrateBook, realToPacked, type RealPosition } from "../../web/lib/kaskad/calibrate.js";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "../../web/lib/kaskad/tx.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const SEND = args.includes("--yes");
const calArg = args[args.indexOf("--cal") + 1];
const CAL: Record<number, number> =
  args.includes("--cal") && calArg
    ? Object.fromEntries(calArg.split(",").map((kv) => kv.split(":").map(Number)))
    : { 9: 10_000, 12: 2_000 };

const maxLoadArg = args[args.indexOf("--max-load") + 1];
const MAX_LOAD = args.includes("--max-load") && maxLoadArg ? Number(maxLoadArg) : Infinity; // per book, this run
const CALIBRATED = 256;
const CHUNK = 1_000;
const MIN_DEPTH_USD = 250_000; // below this we do not trust the measured on-chain depth
const ASSUMED_THIN_DEPTH_USD = 1_000_000;
const ASSUMED_DEFAULT_DEPTH_USD = 25_000_000;
const UI_ASSETS = [9, 12, 2, 10, 8];

type Data = {
  block: number;
  reserves: { id: number; symbol: string; address: string; decimals: number; priceUsd8: string; suppliedUsd: number; debtUsd: number }[];
  eModes: { id: number; label: string; ltBps: number; bonusBps: number }[];
  totals: { positions: number; collateralUsd: number; debtUsd: number; reserveSuppliedUsd: number; reserveDebtUsd: number };
  positions: (RealPosition & { hfOnchain: number | null })[];
};
type Depth = Record<string, { depthUsd: number; source: string; isAssumption: boolean; note: string }>;

const data: Data = JSON.parse(readFileSync(join(root, "scripts/data/positions.json"), "utf8"));
const depth: Depth = JSON.parse(readFileSync(join(root, "scripts/data/depth.json"), "utf8"));

// Optional comparison books from Aave on Ethereum (scripts/data/eth-*.json), simulated on Monad
// under synthetic asset ids (14, 15). Pass --no-eth to skip.
type EthBook = Pick<Data, "reserves" | "positions"> & { depth: Depth[string] };
const ethFiles = args.includes("--no-eth")
  ? []
  : readdirSync(join(root, "scripts/data")).filter((f) => /^eth-.*.json$/.test(f) && !f.endsWith(".raw.json"));
for (const f of ethFiles) {
  const eth: EthBook = JSON.parse(readFileSync(join(root, "scripts/data", f), "utf8"));
  data.reserves.push(...eth.reserves);
  // skip dust (storage costs MON); the syrupUSDT book (15) was loaded before this filter existed
  data.positions.push(...eth.positions.filter((p) => p.debtUsd >= 100 || eth.reserves[0].id === 15));
  depth[String(eth.reserves[0].id)] = eth.depth;
}
const dep = JSON.parse(readFileSync(join(root, "contracts/deployments/testnet.json"), "utf8")) as {
  kaskad: Address;
  guard: Address;
  marketA: Address;
  marketB: Address;
  block: number;
};

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(requireEnv("MONAD_TESTNET_RPC"), { timeout: 60_000, retryCount: 3 }),
}) as PublicClient;
const account = privateKeyToAccount(requireEnv("DEPLOYER_PRIVATE_KEY") as Hex);

const WAD = 10n ** 18n;
const priceWad = (p8: string) => BigInt(p8) * 10n ** 10n;
const usdWad = (usd: number) => BigInt(Math.round(usd)) * WAD;

function depthFor(id: number) {
  const d = depth[String(id)];
  if (d && !d.isAssumption && d.depthUsd >= MIN_DEPTH_USD)
    return { depthUsd: d.depthUsd, isAssumption: false, source: d.source, note: d.note };
  if (d)
    return {
      depthUsd: ASSUMED_THIN_DEPTH_USD,
      isAssumption: true,
      source: d.source,
      note: `Monad DEX derinliği yalnızca ~$${Math.round(d.depthUsd).toLocaleString("en-US")}; köprü/CEX çıkışı için $1M varsayıldı.`,
    };
  return { depthUsd: ASSUMED_DEFAULT_DEPTH_USD, isAssumption: true, source: "assumption", note: "Ölçülmedi; $25M varsayıldı." };
}

// ---------------------------------------------------------------- tx plumbing
let nonce = 0;
let spentWei = 0n;
async function send(data: Hex, to: Address, gasOverride?: bigint, label = "") {
  const gas =
    gasOverride ?? ((await client.estimateGas({ account: account.address, to, data })) * 102n) / 100n + 5_000n;
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
  const { receipt, sync, ms } = await sendRawSync(client as never, raw, 60_000);
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${receipt.transactionHash}`);
  spentWei += gas * receipt.effectiveGasPrice; // Monad charges the gas limit
  console.log(
    `  ✓ ${label} gasUsed=${receipt.gasUsed} limit=${gas} ${sync ? "sync" : "async"} ${ms}ms ${receipt.transactionHash}`,
  );
  return receipt;
}

const read = <T>(functionName: string, args: unknown[] = []) =>
  client.readContract({ address: dep.kaskad, abi: kaskadAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

// ---------------------------------------------------------------- plan
const byAsset = new Map<number, RealPosition[]>();
for (const p of data.positions) {
  if (p.debtUsd <= 0) continue;
  byAsset.set(p.collateralId, [...(byAsset.get(p.collateralId) ?? []), p]);
}
const reserveById = new Map(data.reserves.map((r) => [r.id, r]));

type Book = { bookId: number; assetId: number; packed: bigint[]; calibrated: boolean };
const books: Book[] = [];
for (const [assetId, ps] of [...byAsset.entries()].sort((a, b) => a[0] - b[0])) {
  const sorted = [...ps].sort((a, b) => b.debtUsd - a.debtUsd);
  books.push({ bookId: assetId, assetId, packed: sorted.map((p) => packPosition(realToPacked(p))), calibrated: false });
  const n = CAL[assetId];
  if (n) {
    const price = Number(reserveById.get(assetId)!.priceUsd8) / 1e8;
    const cal = calibrateBook(sorted, n, price, 1000 + assetId);
    books.push({ bookId: CALIBRATED | assetId, assetId, packed: cal.map(packPosition), calibrated: true });
  }
}

async function main() {
  const [chainId, balance, gasPrice, owner] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: account.address }),
    client.getGasPrice(),
    read<Address>("owner"),
  ]);
  if (chainId !== 10143) throw new Error("not Monad testnet");
  if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error("deployer is not the Kaskad owner");
  nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });

  let newSlots = 0;
  const lengths = new Map<number, number>();
  for (const b of books) {
    const len = Number(await read<bigint>("bookLength", [BigInt(b.bookId)]));
    lengths.set(b.bookId, len);
    newSlots += Math.max(0, Math.min(b.packed.length, MAX_LOAD) - len);
  }
  const estGas = BigInt(newSlots) * 19_000n + 3_000_000n;
  console.log(`deployer ${account.address} balance ${(Number(balance) / 1e18).toFixed(3)} MON, gas price ${Number(gasPrice) / 1e9} gwei`);
  for (const b of books)
    console.log(`  book ${b.bookId}${b.calibrated ? " (kalibre)" : ""}: ${lengths.get(b.bookId)}/${b.packed.length}`);
  console.log(`new slots: ${newSlots}, est. gas ${estGas} ≈ ${(Number(estGas * parseGwei("104")) / 1e18).toFixed(2)} MON`);
  if (!SEND) return console.log("dry run; pass --yes to send");

  // assets
  for (const id of new Set(books.map((b) => b.assetId))) {
    const r = reserveById.get(id)!;
    const d = depthFor(id);
    const cfg = (await read<[bigint, bigint]>("assets", [BigInt(id)])) as readonly [bigint, bigint];
    if (cfg[0] === priceWad(r.priceUsd8) && cfg[1] === usdWad(d.depthUsd)) continue;
    await send(
      encodeFunctionData({ abi: kaskadAbi, functionName: "setAsset", args: [BigInt(id), priceWad(r.priceUsd8), usdWad(d.depthUsd)] }),
      dep.kaskad,
      undefined,
      `setAsset ${r.symbol}`,
    );
  }
  if (Number(await read<bigint>("sourceBlock")) !== data.block)
    await send(
      encodeFunctionData({ abi: kaskadAbi, functionName: "setDataInfo", args: [BigInt(data.block)] }),
      dep.kaskad,
      undefined,
      "setDataInfo",
    );

  // books
  for (const b of books) {
    let len = lengths.get(b.bookId)!;
    if (len > b.packed.length) throw new Error(`book ${b.bookId} longer than plan; resetBook first`);
    const target = Math.min(b.packed.length, MAX_LOAD);
    while (len < target) {
      const part = b.packed.slice(len, Math.min(len + CHUNK, target));
      await send(
        encodeFunctionData({ abi: kaskadAbi, functionName: "loadPositions", args: [BigInt(b.bookId), part] }),
        dep.kaskad,
        undefined,
        `load book ${b.bookId} [${len}..${len + part.length})`,
      );
      len += part.length;
    }
  }

  // guard: real syrupUSDC book, -3% over 20 blocks
  const syrupReal = books.find((b) => b.bookId === 9)!;
  const scenario = {
    assetId: 9,
    shockBps: 300,
    steps: 20,
    maxRoundsPerStep: 3,
    maxPositions: syrupReal.packed.length,
    oracleFeedbackBps: 10_000,
  };
  const cur = (await client.readContract({ address: dep.guard, abi: guardAbi, functionName: "scenario" })) as typeof scenario;
  if (cur.maxPositions !== scenario.maxPositions || cur.shockBps !== scenario.shockBps)
    await send(
      encodeFunctionData({ abi: guardAbi, functionName: "setConfig", args: [scenario, 50, 0, 7000] }),
      dep.guard,
      undefined,
      "guard.setConfig",
    );

  console.log(`spent ≈ ${(Number(spentWei) / 1e18).toFixed(3)} MON`);
}

function writeWebConfig() {
  const assets: Record<string, unknown> = {};
  for (const [id, ps] of byAsset) {
    const r = reserveById.get(id)!;
    const d = depthFor(id);
    assets[id] = {
      id,
      symbol: r.symbol,
      decimals: r.decimals,
      priceUsd: Number(r.priceUsd8) / 1e8,
      suppliedUsd: r.suppliedUsd,
      depthUsd: d.depthUsd,
      depthIsAssumption: d.isAssumption,
      depthSource: d.source,
      depthNote: d.note,
      realPositions: ps.length,
      calibratedPositions: Math.min(CAL[id] ?? 0, MAX_LOAD),
      collateralUsd: ps.reduce((s, p) => s + p.collateralUsd, 0),
      debtUsd: ps.reduce((s, p) => s + p.debtUsd, 0),
      ltBps: ps[0].ltBps,
      bonusBps: ps[0].bonusBps,
      inUi: UI_ASSETS.includes(id),
    };
  }
  const cfg = {
    chainId: 10143,
    contracts: { kaskad: dep.kaskad, guard: dep.guard, marketA: dep.marketA, marketB: dep.marketB },
    deployBlock: dep.block,
    source: { chainId: 143, block: data.block, borrowersWithDebt: data.totals.positions },
    totals: {
      suppliedUsd: data.totals.reserveSuppliedUsd,
      debtUsd: data.totals.reserveDebtUsd,
      borrowerCollateralUsd: data.totals.collateralUsd,
      positions: data.totals.positions,
    },
    assets,
  };
  const path = join(root, "web/lib/kaskad/deployment.json");
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
  console.log("wrote web/lib/kaskad/deployment.json");
}

if (!existsSync(join(root, "contracts/deployments/testnet.json"))) throw new Error("deploy first");
writeWebConfig();
main().catch((e) => {
  console.error(String(e?.shortMessage ?? e?.message ?? e).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
