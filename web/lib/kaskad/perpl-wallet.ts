import { BaseError, ContractFunctionRevertedError, type Address, type PublicClient } from "viem";
import type { PerplWallet, WalletPosition } from "@/lib/chain/perpl-wallet-risk";
import { PERPL_EXCHANGE, PERPL_MARKETS, toPosition } from "./perpl";
import { perplExchangeAbi } from "./perpl-abi";
import { perplWalletAbi } from "./perpl-wallet-abi";

const abi = [...perplWalletAbi, ...perplExchangeAbi] as const;
type Reader = Pick<PublicClient, "readContract" | "getBlockNumber">;
type Bitmap = { bank1: bigint; bank2: bigint; bank3: bigint; bank4: bigint };

/** SDK state/account.rs: bank1's final three bits are flags, subsequent banks start at 253. */
export function activePerpetuals(bitmap: Bitmap): number[] {
  return ([ [bitmap.bank1, 0, 253], [bitmap.bank2, 253, 256], [bitmap.bank3, 509, 256], [bitmap.bank4, 765, 256] ] as const)
    .flatMap(([bits, offset, length]) => Array.from({ length }, (_, i) => i).filter((i) => (bits & (1n << BigInt(i))) !== 0n).map((i) => i + offset));
}

/** Account and positions are pinned to one block; no auth, transactions, or order-history API. */
export async function readPerplWallet(client: Reader, address: Address): Promise<PerplWallet> {
  const blockNumber = await client.getBlockNumber();
  const base = { address, block: Number(blockNumber), readAt: Date.now(), positions: [], unsupportedMarkets: [] };
  let account;
  try {
    account = await client.readContract({ address: PERPL_EXCHANGE, abi, functionName: "getAccountByAddr", args: [address], blockNumber });
  } catch (error) {
    const revert = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "AccountDoesNotExist") return { ...base, account: null };
    throw error;
  }
  if (account.accountAddr.toLowerCase() !== address.toLowerCase() || account.accountId <= 0n || account.accountId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid Perpl account");
  const ids = activePerpetuals(account.positions);
  const supported = PERPL_MARKETS.filter((m) => ids.includes(m.perpId));
  const positions: WalletPosition[] = await Promise.all(supported.map(async ({ perpId, symbol }) => {
    const args = [BigInt(perpId)] as const;
    const [info, [raw, markPNS, markValid]] = await Promise.all([
      client.readContract({ address: PERPL_EXCHANGE, abi, functionName: "getPerpetualInfoV2", args, blockNumber }),
      client.readContract({ address: PERPL_EXCHANGE, abi, functionName: "getPositionV2", args: [args[0], account.accountId], blockNumber }),
    ]);
    const [, maintenance] = await client.readContract({ address: PERPL_EXCHANGE, abi, functionName: "getMarginFractions", args: [args[0], raw.lotLNS], blockNumber });
    if (!markValid || markPNS <= 0n || maintenance <= 0n || raw.lotLNS <= 0n || raw.accountId !== account.accountId || (raw.positionType !== 0 && raw.positionType !== 1)) throw new Error("Invalid Perpl position");
    const priceScale = 10 ** Number(info.priceDecimals);
    const position = { ...toPosition(raw, priceScale, 10 ** Number(info.lotDecimals)), symbol, perpId, mark: Number(markPNS) / priceScale, mmf: Number(maintenance) / 100 };
    if (![position.entry, position.mark, position.size, position.mmf].every((v) => Number.isFinite(v) && v > 0) || ![position.deposit, position.premium].every(Number.isFinite)) throw new Error("Invalid Perpl units");
    return position;
  }));
  return {
    ...base,
    account: { id: String(account.accountId), balance: Number(account.balanceCNS) / 1e6, locked: Number(account.lockedBalanceCNS) / 1e6, frozen: account.frozen !== 0 },
    positions,
    unsupportedMarkets: ids.filter((id) => !PERPL_MARKETS.some((m) => m.perpId === id)),
    readAt: Date.now(),
  };
}
