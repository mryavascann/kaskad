import { parseAbi, type Address, type PublicClient } from "viem";

// Aave V3 on Monad MAINNET (read only). Source: bgd-labs/aave-address-book AaveV3Monad.sol.
export const AAVE = {
  POOL: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
  DATA_PROVIDER: "0xB65A68B98274ef7D9a60E0C0747dD1BEc3D32fad",
  ORACLE: "0x0c02b2c2038066C10Eab8fe1D5Cdb73d5a78A1Bf",
} as const satisfies Record<string, Address>;

const poolAbi = parseAbi([
  "function getReservesList() view returns (address[])",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserEMode(address user) view returns (uint256)",
  "function getUserConfiguration(address user) view returns ((uint256 data))",
  "function getEModeCategoryCollateralConfig(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus))",
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
]);
const dataProviderAbi = parseAbi([
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
]);
const oracleAbi = parseAbi(["function getAssetsPrices(address[] assets) view returns (uint256[])"]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

type StaticReserve = {
  id: number;
  asset: Address;
  symbol: string;
  decimals: number;
  aToken: Address;
  vToken: Address;
  ltBps: number;
  bonusBps: number;
};
type StaticData = { reserves: StaticReserve[]; eModes: Map<number, { ltBps: number; bonusBps: number; bitmap: bigint }> };

let cache: { at: number; data: StaticData } | null = null;

async function staticData(client: PublicClient): Promise<StaticData> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.data;
  const list = await client.readContract({ address: AAVE.POOL, abi: poolAbi, functionName: "getReservesList" });
  const calls = list.flatMap((asset) => [
    { address: AAVE.DATA_PROVIDER, abi: dataProviderAbi, functionName: "getReserveTokensAddresses", args: [asset] },
    { address: AAVE.DATA_PROVIDER, abi: dataProviderAbi, functionName: "getReserveConfigurationData", args: [asset] },
    { address: asset, abi: erc20Abi, functionName: "symbol" },
  ]);
  const res = (await client.multicall({ contracts: calls as never, allowFailure: false })) as unknown[];
  const reserves: StaticReserve[] = list.map((asset, i) => {
    const tokens = res[i * 3] as readonly [Address, Address, Address];
    const cfg = res[i * 3 + 1] as readonly bigint[];
    return {
      id: i,
      asset,
      symbol: res[i * 3 + 2] as string,
      decimals: Number(cfg[0]),
      aToken: tokens[0],
      vToken: tokens[2],
      ltBps: Number(cfg[2]),
      bonusBps: Math.max(0, Number(cfg[3]) - 10_000),
    };
  });
  const ids = [1, 2, 3, 4, 5, 6, 7, 8];
  const em = (await client.multicall({
    contracts: ids.flatMap((id) => [
      { address: AAVE.POOL, abi: poolAbi, functionName: "getEModeCategoryCollateralConfig", args: [id] },
      { address: AAVE.POOL, abi: poolAbi, functionName: "getEModeCategoryCollateralBitmap", args: [id] },
    ]) as never,
  })) as { status: string; result?: unknown }[];
  const eModes = new Map<number, { ltBps: number; bonusBps: number; bitmap: bigint }>();
  ids.forEach((id, k) => {
    const c = em[k * 2];
    const b = em[k * 2 + 1];
    if (c.status !== "success" || b.status !== "success") return;
    const cfg = c.result as { liquidationThreshold: number; liquidationBonus: number };
    if (!cfg.liquidationThreshold) return;
    eModes.set(id, {
      ltBps: cfg.liquidationThreshold,
      bonusBps: Math.max(0, cfg.liquidationBonus - 10_000),
      bitmap: b.result as bigint,
    });
  });
  cache = { at: Date.now(), data: { reserves, eModes } };
  return cache.data;
}

export type ReserveLine = {
  id: number;
  symbol: string;
  suppliedUsd: number;
  borrowedUsd: number;
  isCollateral: boolean;
  ltBps: number;
  bonusBps: number;
  utilization: number; // protocol-wide, debt / supply
  reserveSuppliedUsd: number;
};

export type UserPosition = {
  address: Address;
  block: number;
  eMode: number;
  hfOnchain: number | null;
  collateralUsd: number;
  debtUsd: number;
  reserves: ReserveLine[];
  dominant: ReserveLine | null;
  /** other collateral, expressed in the dominant asset's LT units so single-LT math is exact */
  otherLtAdjustedUsd: number;
  protocol: { suppliedUsd: number; debtUsd: number };
};

export async function fetchUserPosition(client: PublicClient, user: Address): Promise<UserPosition> {
  const { reserves, eModes } = await staticData(client);
  const block = await client.getBlockNumber();
  const assets = reserves.map((r) => r.asset);
  const calls = [
    { address: AAVE.POOL, abi: poolAbi, functionName: "getUserAccountData", args: [user] },
    { address: AAVE.POOL, abi: poolAbi, functionName: "getUserEMode", args: [user] },
    { address: AAVE.POOL, abi: poolAbi, functionName: "getUserConfiguration", args: [user] },
    { address: AAVE.ORACLE, abi: oracleAbi, functionName: "getAssetsPrices", args: [assets] },
    ...reserves.flatMap((r) => [
      { address: r.aToken, abi: erc20Abi, functionName: "balanceOf", args: [user] },
      { address: r.vToken, abi: erc20Abi, functionName: "balanceOf", args: [user] },
      { address: r.aToken, abi: erc20Abi, functionName: "totalSupply" },
      { address: r.vToken, abi: erc20Abi, functionName: "totalSupply" },
    ]),
  ];
  const res = (await client.multicall({
    contracts: calls as never,
    allowFailure: false,
    blockNumber: block,
  })) as unknown[];
  const acct = res[0] as readonly bigint[];
  const eMode = Number(res[1] as bigint);
  const config = (res[2] as { data: bigint }).data;
  const prices = res[3] as readonly bigint[];
  const em = eModes.get(eMode);

  let protoSupplied = 0;
  let protoDebt = 0;
  const lines: ReserveLine[] = reserves.map((r, i) => {
    const [aBal, vBal, aTot, vTot] = res.slice(4 + i * 4, 8 + i * 4) as bigint[];
    const px = Number(prices[i]) / 1e8;
    const scale = 10 ** r.decimals;
    const inEm = em && ((em.bitmap >> BigInt(i)) & 1n) === 1n;
    const reserveSuppliedUsd = (Number(aTot) / scale) * px;
    const reserveDebtUsd = (Number(vTot) / scale) * px;
    protoSupplied += reserveSuppliedUsd;
    protoDebt += reserveDebtUsd;
    return {
      id: r.id,
      symbol: r.symbol,
      suppliedUsd: (Number(aBal) / scale) * px,
      borrowedUsd: (Number(vBal) / scale) * px,
      isCollateral: ((config >> BigInt(2 * i + 1)) & 1n) === 1n && aBal > 0n,
      ltBps: inEm ? em!.ltBps : r.ltBps,
      bonusBps: inEm ? em!.bonusBps : r.bonusBps,
      utilization: reserveSuppliedUsd > 0 ? reserveDebtUsd / reserveSuppliedUsd : 0,
      reserveSuppliedUsd,
    };
  });

  const coll = lines.filter((l) => l.isCollateral);
  const dominant = coll.length ? coll.reduce((a, b) => (b.suppliedUsd > a.suppliedUsd ? b : a)) : null;
  const otherLtAdjustedUsd =
    dominant && dominant.ltBps > 0
      ? coll.filter((l) => l !== dominant).reduce((s, l) => s + (l.suppliedUsd * l.ltBps) / dominant.ltBps, 0)
      : 0;
  const hf = acct[5];
  return {
    address: user,
    block: Number(block),
    eMode,
    hfOnchain: hf > 10n ** 30n ? null : Number(hf) / 1e18,
    collateralUsd: Number(acct[0]) / 1e8,
    debtUsd: Number(acct[1]) / 1e8,
    reserves: lines.filter((l) => l.suppliedUsd > 0.01 || l.borrowedUsd > 0.01),
    dominant,
    otherLtAdjustedUsd,
    protocol: { suppliedUsd: protoSupplied, debtUsd: protoDebt },
  };
}
