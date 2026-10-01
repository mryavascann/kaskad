/**
 * Pure part of the OG cards: turns live chain data into the text on the card. No network, no JSX,
 * so it is unit-tested. Every number comes from the arguments; missing data gives no metrics (the card
 * then shows the title only), never a placeholder number.
 */
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import type { Finding } from "@/lib/chain/finding";
import type { GuardConfig } from "@/lib/chain/guard";
import type { MarketState } from "@/lib/chain/types";
import { ogCopy, type OgPage } from "./copy";

export type OgTone = "fg" | "warn" | "liq" | "safe" | "monad";

export type OgMetric = {
  label: string;
  value: string;
  tone: OgTone;
  /** "number" renders large in Geist Mono; "text" (a state such as "Borrowing paused") smaller in Geist. */
  kind: "number" | "text";
};

export type OgCard = {
  kicker: string;
  title: string;
  /** Live numbers; empty when the data could not be read. */
  metrics: OgMetric[];
  /** Small print under the metrics (source, block); null when there is nothing to cite. */
  source: string | null;
  /** Top-right status, e.g. "MONAD TESTNET · BLOCK 66,989,757"; null without a live block. */
  status: string | null;
};

/**
 * Uppercase for mono labels, following the language: Turkish "i" becomes "İ". English terms inside
 * Turkish copy are passed as `{ en }` so "Blitz" stays "BLITZ", not "BLİTZ" (design rule 10).
 */
export function ogUpper(parts: string | (string | { en: string })[], locale: Locale): string {
  const list = typeof parts === "string" ? [parts] : parts;
  return list
    .map((p) => (typeof p === "string" ? p.toLocaleUpperCase(locale === "tr" ? "tr-TR" : "en-US") : p.en.toLocaleUpperCase("en-US")))
    .join("");
}

/** "829×" / "829×": the stuck-to-cleared ratio, no decimals above 100, one below. */
export function formatRatio(ratio: number, locale: Locale): string {
  const fmt = formatters(locale);
  return `${fmt.num(ratio, ratio >= 100 ? 0 : 1)}×`;
}

function status(locale: Locale, block: bigint | null): string | null {
  if (block === null) return null;
  const t = ogCopy[locale];
  return `${ogUpper([{ en: t.network }], locale)} · ${ogUpper(t.block, locale)} ${formatters(locale).int(block)}`;
}

/** Home and console: the live finding (stuck debt, cleared, gap), or just the title. */
export function findingCard(page: "home" | "app", locale: Locale, finding: Finding | null): OgCard {
  const t = ogCopy[locale];
  const p = t.pages[page];
  if (!finding) return { kicker: ogUpper(p.kicker, locale), title: p.title, metrics: [], source: null, status: null };
  const fmt = formatters(locale);
  const metrics: OgMetric[] = [
    { label: ogUpper(t.finding.stuck, locale), value: fmt.usd(finding.stuckDebtUsd), tone: "warn", kind: "number" },
    { label: ogUpper(t.finding.cleared, locale), value: fmt.usd(finding.clearedUsd), tone: "fg", kind: "number" },
  ];
  if (finding.gapRatio !== null) metrics.push({ label: ogUpper(t.finding.gap, locale), value: formatRatio(finding.gapRatio, locale), tone: "liq", kind: "number" });
  return {
    kicker: ogUpper([t.finding.kicker, " · ", { en: finding.symbol }, " ", fmt.drop(finding.shockPct / 100)], locale),
    title: p.title,
    metrics,
    source: `${finding.symbol} ${fmt.drop(finding.shockPct / 100)} · ${t.finding.realBook}, ${fmt.int(finding.positionsUsed)} ${t.finding.positions}`,
    status: status(locale, finding.blockNumber),
  };
}

export type GuardSnapshot = {
  config: Pick<GuardConfig, "badDebtThresholdBps" | "safeLtvBps" | "scenario">;
  /** The guarded market (B); null when it could not be read. */
  market: Pick<MarketState, "paused" | "maxLtvBps"> | null;
  /** Display symbol of the Guard's scenario asset; null when unknown. */
  symbol: string | null;
  block: bigint | null;
};

/** Guard: the rule as the contract stores it, and the guarded market's state. */
export function guardCard(locale: Locale, snap: GuardSnapshot | null): OgCard {
  const t = ogCopy[locale];
  const p = t.pages.guard;
  if (!snap) return { kicker: ogUpper(p.kicker, locale), title: p.title, metrics: [], source: null, status: null };
  const fmt = formatters(locale);
  const metrics: OgMetric[] = [
    { label: ogUpper(t.guard.trigger, locale), value: fmt.pct(snap.config.badDebtThresholdBps / 10_000), tone: "liq", kind: "number" },
    { label: ogUpper(t.guard.safeLtv, locale), value: fmt.pct(snap.config.safeLtvBps / 10_000, 0), tone: "fg", kind: "number" },
  ];
  if (snap.market) {
    metrics.push({
      label: ogUpper(t.guard.market, locale),
      value: snap.market.paused ? t.guard.paused : t.guard.open,
      tone: snap.market.paused ? "safe" : "warn",
      kind: "text",
    });
  }
  const shock = fmt.drop(snap.config.scenario.shockBps / 10_000);
  return {
    kicker: ogUpper([t.guard.kicker, " · ", { en: "KaskadGuard" }], locale),
    title: p.title,
    metrics,
    source: snap.symbol ? `${t.guard.scenario}: ${snap.symbol} ${shock}` : null,
    status: status(locale, snap.block),
  };
}

/** Wallet and how-it-works: title and the snapshot block from deployment.json (data, not a guess). */
export function staticCard(page: Exclude<OgPage, "home" | "app" | "guard">, locale: Locale, snapshotBlock: number | null): OgCard {
  const t = ogCopy[locale];
  const p = t.pages[page];
  return {
    kicker: ogUpper(p.kicker, locale),
    title: p.title,
    metrics: [],
    source: snapshotBlock === null ? null : `${t.snapshot} ${formatters(locale).int(snapshotBlock)}`,
    status: null,
  };
}

/** Resolves to null when `promise` rejects or takes longer than `ms`: the card falls back to its title. */
export async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
