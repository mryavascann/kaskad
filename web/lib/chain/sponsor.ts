// Gas sponsor status (GET /api/fund) and signer-page constants (app/(legacy)/baglan/Connect.tsx).

import type { Address } from "viem";

/** Testnet faucet the connect page links to (Connect.tsx:14). */
export const FAUCET_URL = "https://faucet.monad.xyz";
/** Balance + sponsor refresh period on the connect page (Connect.tsx:83). */
export const BALANCE_POLL_MS = 10_000;
/** Spendable sponsor budget under which the page suggests a personal wallet (Connect.tsx:103). */
export const SPONSOR_LOW_WEI = 3n * 10n ** 18n;

export type SponsorStatus = {
  address: Address;
  balanceWei: bigint;
  /** Balance above the reserve: what burners can still be funded with. */
  spendableWei: bigint;
  /** Kept back by /api/fund (app/api/fund/route.ts:7); read it instead of hard-coding "10 MON". */
  reserveWei: bigint | null;
};

type SponsorJson = { address: Address; balanceWei: string; spendableWei: string; reserveWei?: string };

/**
 * GET /api/fund (Connect.tsx:75-78): null when the route is not configured or fails, like the
 * legacy page (errors are swallowed).
 */
export async function fetchSponsor(fetchImpl: typeof fetch = fetch, url = "/api/fund"): Promise<SponsorStatus | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const s = (await res.json()) as SponsorJson;
    return {
      address: s.address,
      balanceWei: BigInt(s.balanceWei),
      spendableWei: BigInt(s.spendableWei),
      reserveWei: s.reserveWei !== undefined ? BigInt(s.reserveWei) : null,
    };
  } catch {
    return null;
  }
}

/** Connect.tsx:102-103. */
export const isSponsorLow = (spendableWei: bigint | null): boolean => spendableWei !== null && spendableWei < SPONSOR_LOW_WEI;
