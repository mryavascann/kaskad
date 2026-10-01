// Static deployment data for the new UI (no network). Everything comes from
// lib/kaskad/deployment.json through lib/kaskad/config.ts; nothing here is a literal metric.

import type { Address } from "viem";
import { DEPLOYMENT, type AssetInfo } from "@/lib/kaskad/config";

export {
  CALIBRATED,
  DEPLOYMENT,
  EXPLORER,
  RESOLUTIONS,
  UI_ASSET_ORDER,
  UI_ASSETS,
  addrUrl,
  txUrl,
  type AssetInfo,
} from "@/lib/kaskad/config";
export { wadToNum } from "@/lib/kaskad/format";

/** Contract addresses on Monad testnet. `kaskadMC` is optional in the deployment type. */
export const CONTRACTS: {
  kaskad: Address;
  kaskadMC?: Address;
  guard: Address;
  marketA: Address;
  marketB: Address;
} = DEPLOYMENT.contracts;

/** Asset info by Aave reserve index, or undefined when the deployment has no such book. */
export function assetInfo(id: number): AssetInfo | undefined {
  return DEPLOYMENT.assets[id];
}

/** Every asset book in the deployment, ascending id. */
export function allAssets(): AssetInfo[] {
  return Object.values(DEPLOYMENT.assets).sort((a, b) => a.id - b.id);
}

/**
 * Market overview strip (app/_components/Protocol.tsx:289-297): protocol totals, the syrupUSDC
 * risk focus and where the data came from. All values from deployment.json.
 */
export function marketOverview(focusAssetId = 9) {
  const t = DEPLOYMENT.totals;
  const focus = DEPLOYMENT.assets[focusAssetId];
  return {
    suppliedUsd: t.suppliedUsd,
    debtUsd: t.debtUsd,
    borrowerCollateralUsd: t.borrowerCollateralUsd,
    positions: t.positions,
    borrowersWithDebt: DEPLOYMENT.source.borrowersWithDebt,
    focus: focus
      ? { assetId: focus.id, collateralUsd: focus.collateralUsd, debtUsd: focus.debtUsd, ltBps: focus.ltBps }
      : null,
    /** Monad mainnet (chainId 143) Aave snapshot block the books were built from. */
    source: { chainId: DEPLOYMENT.source.chainId, block: DEPLOYMENT.source.block },
    /** Monad testnet chain id and deploy block of the engine contracts. */
    deployment: { chainId: DEPLOYMENT.chainId, block: DEPLOYMENT.deployBlock },
  };
}
