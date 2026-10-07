import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it, vi } from "vitest";
import { activePerpetuals, readPerplWallet } from "./perpl-wallet";
import { perplWalletAbi } from "./perpl-wallet-abi";
import { PERPL_EXCHANGE } from "./perpl";

const address = "0x1111111111111111111111111111111111111111";
const raw = { accountId: 6n, nextNodeId: 0n, prevNodeId: 0n, positionType: 0, depositCNS: 20_000_000n, pricePNS: 1_000n, lotLNS: 200n, premiumPnlCNS: -1_000_000n, priceResiduePNSQ16: 0n };
const account = { accountId: 6n, accountAddr: address, balanceCNS: 100_000_000n, lockedBalanceCNS: 30_000_000n, frozen: 0, positions: { bank1: (1n << 1n) | (1n << 7n), bank2: 0n, bank3: 0n, bank4: 0n } };
function reader(over: Record<string, unknown> = {}) {
  const readContract = vi.fn(async ({ functionName, address: contract, blockNumber }: { functionName: string; address: string; blockNumber: bigint }) => {
    expect(contract).toBe(PERPL_EXCHANGE);
    expect(blockNumber).toBe(123n);
    const values: Record<string, unknown> = { getAccountByAddr: account, getPositionV2: [raw, 1_010n, true], getPerpetualInfoV2: { priceDecimals: 1n, lotDecimals: 2n }, getMarginFractions: [1_500n, 2_500n], ...over };
    return values[functionName];
  });
  return { readContract, getBlockNumber: async () => 123n };
}

describe("Perpl account reader", () => {
  it("decodes bitmap banks while excluding the three flags", () => {
    expect(activePerpetuals({ bank1: (1n << 252n) | (7n << 253n), bank2: 1n, bank3: 2n, bank4: 1n << 255n })).toEqual([252, 253, 510, 1020]);
  });
  it("pins every account and position read to one block, and reports uncovered markets", async () => {
    const client = reader();
    const wallet = await readPerplWallet(client as never, address);
    expect(wallet).toMatchObject({ address, block: 123, account: { id: "6", balance: 100, locked: 30, frozen: false }, unsupportedMarkets: [7] });
    expect(wallet.positions).toEqual([{ accountId: 6, side: "long", entry: 100, size: 2, deposit: 20, premium: -1, perpId: 1, symbol: "BTC", mark: 101, mmf: 25 }]);
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "getMarginFractions", args: [1n, 200n] }));
    expect(client.readContract).toHaveBeenCalledTimes(4);
  });
  it("distinguishes a missing account from upstream failure", async () => {
    const client = reader();
    const data = encodeErrorResult({ abi: perplWalletAbi, errorName: "AccountDoesNotExist", args: [address] });
    client.readContract.mockRejectedValueOnce(new BaseError("read failed", { cause: new ContractFunctionRevertedError({ abi: perplWalletAbi, data, functionName: "getAccountByAddr" }) }));
    expect(await readPerplWallet(client as never, address)).toMatchObject({ account: null, positions: [], block: 123 });
    client.readContract.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(readPerplWallet(client as never, address)).rejects.toThrow("RPC unavailable");
  });
  it("returns an existing account with no positions without reading market prices", async () => {
    const client = reader({ getAccountByAddr: { ...account, positions: { bank1: 0n, bank2: 0n, bank3: 0n, bank4: 0n } } });
    expect((await readPerplWallet(client as never, address)).positions).toEqual([]);
    expect(client.readContract).toHaveBeenCalledTimes(1);
  });
  it.each([
    { getPositionV2: [raw, 1_010n, false] },
    { getPositionV2: [{ ...raw, accountId: 7n }, 1_010n, true] },
    { getPositionV2: [{ ...raw, lotLNS: 0n }, 1_010n, true] },
    { getMarginFractions: [1n, 0n] },
    { getAccountByAddr: { ...account, accountAddr: "0x2222222222222222222222222222222222222222" } },
  ])("rejects unusable or mismatched data instead of displaying safe zeroes", async (over) => {
    await expect(readPerplWallet(reader(over) as never, address)).rejects.toThrow(/Invalid Perpl/);
  });
});
