import { createPublicClient, http, isAddress, parseEther, zeroAddress, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { sendRawSync, MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS } from "@/lib/kaskad/tx";
import { SPONSOR_GRANT_WEI, SPONSOR_TARGET_WEI, SPONSOR_TOP_UPS } from "@/lib/chain/api-policy";
import { protection, type Lease } from "@/lib/server/protection";
import { ApiError, clientKey, isRecord, json, readJson } from "@/lib/server/request";

const RESERVE = parseEther("10");
const MIN_GRANT = parseEther("0.3");
const WINDOW_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const DAILY_GRANTS = 20; // At most 20 MON of grants per counter window, plus transfer gas.
const GAS = 21_000n;
const clientFor = (rpc: string) => createPublicClient({ chain: monadTestnet, transport: http(rpc, { timeout: 8_000, retryCount: 0 }) }) as PublicClient;
function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.status === 429 ? "çok fazla istek, biraz bekle" : error.message }, error.status, error.retryAfter);
  return json({ error: "fonlama başarısız" }, 502);
}

/** Public status; no private key or provider error is returned. */
export async function GET(req: Request) {
  const pk = process.env.SPONSOR_PRIVATE_KEY;
  const rpc = process.env.MONAD_TESTNET_RPC;
  if (!pk || !rpc) return json({ error: "sponsor yapılandırılmamış" }, 503);
  try {
    await protection().consume([{ key: `fund:status:${clientKey(req)}`, max: 20, windowMs: 10_000 }]);
    const address = privateKeyToAccount(pk as Hex).address;
    const balance = await clientFor(rpc).getBalance({ address });
    return json({ address, balanceWei: balance.toString(), spendableWei: (balance > RESERVE ? balance - RESERVE : 0n).toString(), reserveWei: RESERVE.toString() });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
  const pk = process.env.SPONSOR_PRIVATE_KEY;
  const rpc = process.env.MONAD_TESTNET_RPC;
  if (!pk || !rpc) return json({ error: "sponsor yapılandırılmamış" }, 503);
  let lease: Lease | undefined;
  let broadcastUncertain = false;
  try {
    const guard = protection();
    await guard.consume([{ key: `fund:ip:${clientKey(req)}`, max: 8, windowMs: WINDOW_MS }]);
    const body = await readJson(req, 2_048);
    if (!isRecord(body) || Object.keys(body).some((k) => !["address", "needWei"].includes(k))) throw new ApiError(400, "geçersiz istek");
    const address = body.address;
    if (typeof address !== "string" || !isAddress(address, { strict: false }) || address.toLowerCase() === zeroAddress) throw new ApiError(400, "geçersiz adres");
    const requested = body.needWei === undefined ? MIN_GRANT.toString() : body.needWei;
    if (typeof requested !== "string" || !/^\d{1,19}$/.test(requested)) throw new ApiError(400, "geçersiz istek");
    const need = BigInt(requested);
    if (need <= 0n || need > SPONSOR_TARGET_WEI) throw new ApiError(400, "geçersiz istek");
    const sponsor = privateKeyToAccount(pk as Hex);
    if (address.toLowerCase() === sponsor.address.toLowerCase()) throw new ApiError(400, "geçersiz adres");
    const scope = sponsor.address.toLowerCase();
    // All instances sharing this sponsor must serialize balance/nonce reads and broadcast.
    lease = await guard.lock(`fund:lock:${scope}`);
    const client = clientFor(rpc);
    const current = await client.getBalance({ address });
    if (current >= need) return json({ txHash: null, amount: "0" });
    let amount = ((need - current) * 12n) / 10n;
    if (amount < MIN_GRANT) amount = MIN_GRANT;
    if (amount > SPONSOR_GRANT_WEI) amount = SPONSOR_GRANT_WEI;
    if (current + amount > SPONSOR_TARGET_WEI) amount = SPONSOR_TARGET_WEI - current;
    const balance = await client.getBalance({ address: sponsor.address });
    if (balance < RESERVE + amount + GAS * MAX_FEE_PER_GAS) throw new ApiError(503, "sponsor bakiyesi yetersiz");
    const [nonce, mined] = await Promise.all([
      client.getTransactionCount({ address: sponsor.address, blockTag: "pending" }),
      client.getTransactionCount({ address: sponsor.address, blockTag: "latest" }),
    ]);
    // An earlier timed-out transfer may still be pending. Do not stack another grant behind it.
    if (nonce !== mined) throw new ApiError(429, "sponsor meşgul", 10);
    await guard.consume([
      { key: `fund:address:${scope}:${address.toLowerCase()}`, max: SPONSOR_TOP_UPS, windowMs: WINDOW_MS },
      { key: `fund:budget:${scope}`, max: DAILY_GRANTS, windowMs: DAY_MS },
    ]);
    // Quota is reserved before signing; failed/ambiguous attempts are deliberately not refunded.
    const raw = await sponsor.signTransaction({
      chainId: monadTestnet.id, type: "eip1559", to: address, value: amount, gas: GAS, nonce,
      maxFeePerGas: MAX_FEE_PER_GAS, maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    });
    await lease.renew();
    broadcastUncertain = true;
    const { receipt } = await sendRawSync(client, raw);
    broadcastUncertain = false;
    if (receipt.status !== "success") throw new Error("fonlama tx'i başarısız");
    return json({ txHash: receipt.transactionHash, amount: amount.toString() });
  } catch (error) { return failure(error); }
  finally {
    // On an ambiguous broadcast, keep the shared lock for its remaining 120-second lease.
    if (lease && !broadcastUncertain) await lease.release().catch(() => undefined);
  }
}
