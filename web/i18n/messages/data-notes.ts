/**
 * Honesty notes that ship with the data (deployment.json `depthNote`, recovery.ts `why`) in both
 * languages. The sources mix languages: measured-depth notes are English citations, assumed-depth
 * notes and recovery reasons are Turkish. Turkish text stays verbatim; English is written here per
 * asset id, and every number is re-read from the data instead of being copied into a sentence.
 */
import type { AssetInfo } from "@/lib/kaskad/config";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import type { Locale } from "../config";
import { formatters } from "../format";

/** English for `RECOVERY_BPS[id].why` (Turkish originals in lib/kaskad/recovery.ts). */
const RECOVERY_WHY_EN: Record<number, string> = {
  5: "Monad WETH: CEX and bridge arbitrage; the Monad DEX is shallow",
  7: "Ethereum WETH: CEX-DEX arbitrage every block",
  13: "Ethereum USDC: CEX-DEX arbitrage and Circle redemptions",
  14: "Ethereum USDe: CEX volume plus Ethena mint/redeem (permissioned)",
  2: "Monad USDe: almost no on-chain exit",
  10: "sUSDe: unstaking takes a cooldown; the DEX is shallow",
  8: "weETH: redemption queue; the Monad DEX is shallow",
  9: "syrupUSDC: Maple redemptions take days; no CEX",
  15: "syrupUSDT: Maple redemptions take days; no CEX",
  12: "PT-AUSD: only the Pendle AMM",
};

export type LocalizedNote = { text: string; lang: Locale };

/** Why arbitrage closes this share of the pool gap between blocks (an assumption); null when none is set. */
export function recoveryWhy(assetId: number, locale: Locale): LocalizedNote | null {
  const entry = RECOVERY_BPS[assetId];
  if (!entry) return null;
  if (locale === "tr") return { text: entry.why, lang: "tr" };
  const en = RECOVERY_WHY_EN[assetId];
  return en ? { text: en, lang: "en" } : { text: entry.why, lang: "tr" };
}

/** The measured on-chain depth quoted inside an assumed-depth note ("~$4,838"), if any. */
function quotedDepth(note: string): number | null {
  const m = /~\$([\d.,]+)/.exec(note);
  return m ? Number(m[1].replace(/[.,]/g, "")) : null;
}

/**
 * Pool-depth note for an asset. Measured depths keep their English source citation (tagged
 * lang="en" in Turkish pages); assumed depths are rebuilt from the data in the page's language.
 */
export function depthNote(asset: Pick<AssetInfo, "depthUsd" | "depthIsAssumption" | "depthNote">, locale: Locale): LocalizedNote {
  if (!asset.depthIsAssumption) return { text: asset.depthNote, lang: "en" };
  if (locale === "tr") return { text: asset.depthNote, lang: "tr" };
  const fmt = formatters("en");
  const assumed = fmt.usd(asset.depthUsd, 0);
  const onChain = quotedDepth(asset.depthNote);
  return {
    text:
      onChain === null
        ? `Not measured; ${assumed} assumed.`
        : `Monad DEX depth is only ~${fmt.usdFull(onChain)}; ${assumed} assumed for a bridge or CEX exit.`,
    lang: "en",
  };
}

/**
 * Splits a long note into its first sentence (shown) and the rest (kept one click away, never
 * dropped). Measured-depth citations run up to ~1,300 characters.
 */
export function splitNote(text: string, max = 260): { summary: string; rest: string | null } {
  const end = text.search(/\.(\s|$)/);
  if (end < 0 || end + 1 >= text.length || end + 1 > max) return { summary: text, rest: null };
  const rest = text.slice(end + 1).trim();
  return { summary: text.slice(0, end + 1), rest: rest.length > 0 ? rest : null };
}
