import { createPublicClient, http, isAddress, parseEther, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "@/lib/kaskad/tx";

// Testnet gas sponsor for the in-browser burner wallets. Server-side only.
const RESERVE = parseEther("10"); // Monad keeps 10 MON per EOA; never dip the sponsor below it
const MIN_GRANT = parseEther("0.3");
const MAX_GRANT = parseEther("4");
const MAX_TARGET_BALANCE = parseEther("4");
const WINDOW_MS = 10 * 60_000;
const PER_ADDRESS = 3;
const PER_IP = 8;

const hits = new Map<string, number[]>();
let sponsorQueue: Promise<unknown> = Promise.resolve();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  return false;
}

const err = (status: number, error: string) => Response.json({ error }, { status });

/** Public sponsor status (address + balance), so the UI can suggest a personal wallet when low. */
export async function GET() {
  const pk = process.env.SPONSOR_PRIVATE_KEY;
  const rpc = process.env.MONAD_TESTNET_RPC;
  if (!pk || !rpc) return err(503, "sponsor yapılandırılmamış");
  const client = createPublicClient({ chain: monadTestnet, transport: http(rpc) }) as PublicClient;
  const address = privateKeyToAccount(pk as Hex).address;
  const balance = await client.getBalance({ address });
  const spendable = balance > RESERVE ? balance - RESERVE : 0n;
  return Response.json({
    address,
    balanceWei: balance.toString(),
    spendableWei: spendable.toString(),
    reserveWei: RESERVE.toString(),
  });
}

export async function POST(req: Request) {
  const pk = process.env.SPONSOR_PRIVATE_KEY;
  const rpc = process.env.MONAD_TESTNET_RPC;
  if (!pk || !rpc) return err(503, "sponsor yapılandırılmamış");

  let body: { address?: unknown; needWei?: unknown };
  try {
    body = await req.json();
  } catch {
    return err(400, "geçersiz istek");
  }
  const address = typeof body.address === "string" ? body.address : "";
  if (!isAddress(address, { strict: false })) return err(400, "geçersiz adres");
  let need = MIN_GRANT;
  if (typeof body.needWei === "string" && /^\d{1,30}$/.test(body.needWei)) need = BigInt(body.needWei);

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (limited(`ip:${ip}`, PER_IP) || limited(`addr:${address.toLowerCase()}`, PER_ADDRESS))
    return err(429, "çok fazla istek, biraz bekle");

  const client = createPublicClient({ chain: monadTestnet, transport: http(rpc) }) as PublicClient;
  const sponsor = privateKeyToAccount(pk as Hex);

  const job = sponsorQueue.then(async () => {
    const current = await client.getBalance({ address });
    if (current >= need) return { txHash: null, amount: "0" };
    if (current >= MAX_TARGET_BALANCE) throw Object.assign(new Error("burner zaten yeterince fonlu"), { status: 400 });
    let amount = ((need - current) * 12n) / 10n;
    if (amount < MIN_GRANT) amount = MIN_GRANT;
    if (amount > MAX_GRANT) amount = MAX_GRANT;

    const gas = 21_000n;
    const balance = await client.getBalance({ address: sponsor.address });
    if (balance < RESERVE + amount + gas * MAX_FEE_PER_GAS)
      throw Object.assign(new Error("sponsor bakiyesi yetersiz"), { status: 503 });

    const nonce = await client.getTransactionCount({ address: sponsor.address, blockTag: "pending" });
    const raw = await sponsor.signTransaction({
      chainId: monadTestnet.id,
      type: "eip1559",
      to: address,
      value: amount,
      gas,
      nonce,
      maxFeePerGas: MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    });
    const { receipt } = await sendRawSync(client, raw);
    if (receipt.status !== "success") throw new Error("fonlama tx'i başarısız");
    return { txHash: receipt.transactionHash, amount: amount.toString() };
  });
  sponsorQueue = job.catch(() => undefined);

  try {
    return Response.json(await job);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const msg = status === 500 ? "fonlama başarısız" : (e as Error).message;
    return err(status, msg);
  }
}
