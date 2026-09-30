/**
 * Locale-aware number formatting for the new pages. English: "$111.0M", "3.0%". Turkish keeps the
 * style of the original Turkish UI (lib/kaskad/format.ts): "$111,0M", "$1,2 Mr", "%3,0".
 * Pure and server-safe; every metric on screen goes through here or through `usdParts` (NumberFlow).
 */
import { INTL_LOCALE, type Locale } from "./config";

const MINUS = "−";

/** Compact units per locale. Turkish uses "Mr" (milyar) for billions, like the legacy UI. */
const UNITS: Record<Locale, { k: string; m: string; b: string }> = {
  en: { k: "K", m: "M", b: "B" },
  tr: { k: "K", m: "M", b: " Mr" },
};

export type UsdParts = {
  /** The scaled value to animate (e.g. 111.0 for $111.0M). */
  value: number;
  prefix: string;
  suffix: string;
  /** Intl options for the scaled value. */
  format: Intl.NumberFormatOptions;
  locales: string;
};

/**
 * Splits a USD amount into the pieces NumberFlow (design/ui/metric) needs to roll "$111.0M" digit
 * by digit in either locale. `digits` defaults to 1 for M/B/K and 0 below a thousand.
 */
export function usdParts(n: number, locale: Locale, digits?: number): UsdParts {
  const units = UNITS[locale];
  const a = Math.abs(n);
  const [scale, suffix, fallback] =
    a >= 1e9 ? [1e9, units.b, 2] : a >= 1e6 ? [1e6, units.m, 1] : a >= 1e3 ? [1e3, units.k, 1] : [1, "", 0];
  const d = digits ?? fallback;
  return {
    value: n / scale,
    prefix: n < 0 ? `${MINUS}$` : "$",
    suffix,
    format: { minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: "never" },
    locales: INTL_LOCALE[locale],
  };
}

export function formatters(locale: Locale) {
  const tag = INTL_LOCALE[locale];
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (min: number, max: number) => {
    const key = `${min}:${max}`;
    let f = cache.get(key);
    if (!f) cache.set(key, (f = new Intl.NumberFormat(tag, { minimumFractionDigits: min, maximumFractionDigits: max })));
    return f;
  };
  const fixed = (n: number, digits: number) => nf(digits, digits).format(n);
  const sign = (n: number) => (n < 0 ? MINUS : "");

  return {
    locale,
    tag,
    /** Plain number with grouping, up to `digits` decimals. */
    num: (n: number | bigint, digits = 0) => nf(0, digits).format(Number(n)),
    /** Integer with grouping: 66,989,757 / 66.989.757. */
    int: (n: number | bigint) => nf(0, 0).format(Number(n)),
    /** Compact USD: $111.0M, $133.9K, $1.24B / $111,0M, $133,9K, $1,24 Mr. */
    usd: (n: number, digits?: number) => {
      const p = usdParts(n, locale, digits);
      return `${p.prefix}${fixed(Math.abs(p.value), p.format.maximumFractionDigits ?? 0)}${p.suffix}`;
    },
    /** Full USD without decimals: $110,987,638 / $110.987.638. */
    usdFull: (n: number) => `${sign(n)}$${nf(0, 0).format(Math.abs(n))}`,
    /** Percent from a fraction (0.03 → 3.0% / %3,0). */
    pct: (fraction: number, digits = 1) => {
      const body = fixed(Math.abs(fraction) * 100, digits);
      return locale === "tr" ? `${sign(fraction)}%${body}` : `${sign(fraction)}${body}%`;
    },
    /** A price drop shown as a negative percent: 0.03 → −3.0% / −%3,0. */
    drop: (fraction: number, digits = 1) => {
      const body = fixed(Math.abs(fraction) * 100, digits);
      return locale === "tr" ? `${MINUS}%${body}` : `${MINUS}${body}%`;
    },
    /** Ratio: 828.9 → 829×, 23.5 → 23.5×, 1.07 → 1.07×. */
    ratio: (x: number) => `${fixed(x, x >= 100 ? 0 : x >= 10 ? 1 : 2)}×`,
    /** Gas: 17.7M, 388k. */
    gas: (g: number | bigint) => {
      const v = Number(g);
      return v >= 1e6 ? `${fixed(v / 1e6, v >= 1e7 ? 1 : 2)}M` : v >= 1e3 ? `${fixed(v / 1e3, 0)}k` : fixed(v, 0);
    },
    /** Bytes: 29.6 KB, 1.62 MB. */
    bytes: (b: number | bigint) => {
      const v = Number(b);
      return v >= 1024 * 1024 ? `${fixed(v / 1024 / 1024, 2)} MB` : v >= 1024 ? `${fixed(v / 1024, 1)} KB` : `${fixed(v, 0)} B`;
    },
    /** Block number: #66,989,757. */
    block: (n: number | bigint) => `#${nf(0, 0).format(Number(n))}`,
    /** MON amount (testnet gas): 0.04 MON, "<0.01 MON" below a cent. */
    mon: (x: number) => (x > 0 && x < 0.01 ? `<${fixed(0.01, 2)} MON` : `${fixed(x, 2)} MON`),
    /** Milliseconds: 309 ms. */
    ms: (n: number) => `${nf(0, 0).format(n)} ms`,
    /** A date in the locale's long style (UTC, so server and browser agree). */
    date: (d: Date) => new Intl.DateTimeFormat(tag, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d),
    /** A compact date for tables: Sep 26, 2026 / 26 Eyl 2026 (UTC). */
    dateShort: (d: Date) => new Intl.DateTimeFormat(tag, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(d),
  };
}

export type Formatters = ReturnType<typeof formatters>;
