import type { Address } from "viem";
import deployment from "./deployment.json";

export type AssetInfo = {
  id: number;
  symbol: string;
  decimals: number;
  priceUsd: number;
  suppliedUsd: number;
  depthUsd: number;
  depthIsAssumption: boolean;
  depthSource: string;
  depthNote: string;
  realPositions: number;
  calibratedPositions: number;
  collateralUsd: number;
  debtUsd: number;
  ltBps: number;
  bonusBps: number;
  inUi: boolean;
};

export const DEPLOYMENT = deployment as unknown as {
  chainId: number;
  contracts: { kaskad: Address; guard: Address; marketA: Address; marketB: Address };
  deployBlock: number;
  source: { chainId: number; block: number; borrowersWithDebt: number };
  totals: { suppliedUsd: number; debtUsd: number; borrowerCollateralUsd: number; positions: number };
  assets: Record<string, AssetInfo>;
};

export const CALIBRATED = 256;
export const UI_ASSET_ORDER = [9, 12, 2, 5, 10, 8, 15, 14, 13, 7]; // 7, 13-15: books read from Aave on Ethereum
export const UI_ASSETS: AssetInfo[] = UI_ASSET_ORDER.map((id) => DEPLOYMENT.assets[id]).filter(Boolean);

// The browser talks to our own /api/rpc proxy so the Alchemy key stays on the server.
// NEXT_PUBLIC_MONAD_TESTNET_RPC can override it (e.g. a local anvil in development).
export const TESTNET_RPC =
  process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC ??
  (typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "https://testnet-rpc.monad.xyz");
export const EXPLORER = "https://testnet.monadscan.com";
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;

export const RESOLUTIONS = [500, 1_000, 2_000, 5_000, 10_000];
