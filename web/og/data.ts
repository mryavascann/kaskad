/**
 * Live reads for the OG cards (server only). Each card route revalidates hourly, so the paid RPC sees
 * at most a few requests per hour per card. Every read is bounded by OG_READ_TIMEOUT_MS; a failure
 * or timeout returns null and the card shows its title without numbers.
 */
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { fetchFinding, type Finding } from "@/lib/chain/finding";
import { MARKETS, readGuardConfig, readMarket } from "@/lib/chain/guard";
import { defaultReader } from "@/lib/chain/reader";
import { symbolParts } from "@/lib/chain/scenario";
import { settleWithin, type GuardSnapshot } from "./format";

export const OG_READ_TIMEOUT_MS = 8_000;

/** One retry after a short pause: a single rate-limited request should not cost the card its numbers for an hour. */
function withRetry<T>(read: () => Promise<T>): Promise<T> {
  return read().catch(() => new Promise<T>((resolve, reject) => setTimeout(() => read().then(resolve, reject), 600)));
}

export function loadFinding(): Promise<Finding | null> {
  return settleWithin(withRetry(() => fetchFinding()), OG_READ_TIMEOUT_MS);
}

async function readGuardSnapshot(): Promise<GuardSnapshot> {
  const reader = defaultReader();
  const [config, market, block] = await Promise.all([
    readGuardConfig(reader),
    readMarket(MARKETS.b.address, reader).catch(() => null),
    reader.getBlockNumber({ cacheTime: 0 }).catch(() => null),
  ]);
  const asset = DEPLOYMENT.assets[config.scenario.assetId & 0xff];
  return { config, market, symbol: asset ? symbolParts(asset).base : null, block };
}

export function loadGuard(): Promise<GuardSnapshot | null> {
  return settleWithin(withRetry(readGuardSnapshot), OG_READ_TIMEOUT_MS);
}

/** Monad mainnet block the borrower snapshot was taken at (deployment.json). */
export const snapshotBlock = (): number | null => DEPLOYMENT.source?.block ?? null;
