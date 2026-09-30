/**
 * Number formats of the charts. Every chart takes a `locale` (a string, so it also works from Server
 * Components) and optional `format*` overrides (functions, for client callers that want their own).
 * Defaults are en-US. Pure and cached per locale; safe on the server.
 */

export type Formatter = (value: number) => string;

export type VizFormats = {
  /** Compact US dollars: $111.0M, $133.9K, $950. */
  usd: Formatter;
  /** Axis tick in US dollars, no trailing zeros: $150M, $2.5M, $0. */
  usdTick: Formatter;
  /** Oracle price: $1.1848 under $10, $2,512.40 above. */
  price: Formatter;
  /** A fraction as a percentage: 0.03 → 3.0%. */
  pct: Formatter;
  /** Axis tick percentage, no trailing zeros: 0.1 → 10%, 0.005 → 0.5%. */
  pctTick: Formatter;
  /** A signed change as a percentage: −0.03 → −3.0%. Typographic minus. */
  change: Formatter;
  /** Grouped integer: 66,990,055. */
  int: Formatter;
  /** Compact gas: 14.98M, 387.6K. */
  gas: Formatter;
  /** Bytes: 1.54 MB, 28.9 KB (binary units, as the engine reports memory). */
  bytes: Formatter;
  /** Multiple: ~829×, ~2.3×. */
  ratio: Formatter;
  /** Health factor: 1.024, 12.50, 143,609. */
  hf: Formatter;
  /** Plain number, up to two decimals: 1.05, 3. */
  num: Formatter;
};

export type VizFormatKey = keyof VizFormats;

const cache = new Map<string, Intl.NumberFormat>();

function nf(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

const MINUS = "−";
const KIB = 1024;
const MIB = 1024 * 1024;

const formatsCache = new Map<string, VizFormats>();

/** The default formatters for `locale` (en-US unless told otherwise). */
export function vizFormats(locale = "en-US"): VizFormats {
  const hit = formatsCache.get(locale);
  if (hit) return hit;

  const usd: Formatter = (v) =>
    Math.abs(v) >= 1000
      ? nf(locale, { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
      : nf(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  const usdTick: Formatter = (v) =>
    Math.abs(v) >= 1000
      ? nf(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v)
      : nf(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  const price: Formatter = (v) => {
    const digits = Math.abs(v) < 10 ? 4 : 2;
    return nf(locale, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  };

  const pctFormat = nf(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct: Formatter = (v) => pctFormat.format(v);
  const pctTick: Formatter = (v) => nf(locale, { style: "percent", maximumFractionDigits: 1 }).format(v);
  const change: Formatter = (v) => {
    const body = pctFormat.format(Math.abs(v));
    // Anything that rounds to zero (including -0) is shown unsigned.
    if (body === pctFormat.format(0)) return body;
    return `${v < 0 ? MINUS : "+"}${body}`;
  };

  const int: Formatter = (v) => nf(locale, { maximumFractionDigits: 0 }).format(v);

  const gas: Formatter = (v) =>
    nf(locale, { notation: "compact", maximumFractionDigits: Math.abs(v) >= 1e6 ? 2 : 1 }).format(v);

  const bytes: Formatter = (v) => {
    const a = Math.abs(v);
    if (a >= MIB) return `${nf(locale, { maximumFractionDigits: 2 }).format(v / MIB)} MB`;
    if (a >= KIB) return `${nf(locale, { maximumFractionDigits: 1 }).format(v / KIB)} KB`;
    return `${nf(locale, { maximumFractionDigits: 0 }).format(v)} B`;
  };

  const ratio: Formatter = (v) =>
    `~${nf(locale, { maximumFractionDigits: Math.abs(v) >= 10 ? 0 : 1 }).format(v)}×`;

  const hf: Formatter = (v) => {
    const a = Math.abs(v);
    const digits = a < 10 ? 3 : a < 1000 ? 2 : 0;
    return nf(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  };

  const num: Formatter = (v) => nf(locale, { maximumFractionDigits: 2 }).format(v);

  const formats: VizFormats = { usd, usdTick, price, pct, pctTick, change, int, gas, bytes, ratio, hf, num };
  formatsCache.set(locale, formats);
  return formats;
}

/** Defaults for `locale`, with any caller overrides on top. */
export function withFormats(locale: string | undefined, overrides: Partial<VizFormats>): VizFormats {
  const base = vizFormats(locale);
  let merged: VizFormats | null = null;
  for (const key of Object.keys(overrides) as VizFormatKey[]) {
    const fn = overrides[key];
    if (fn) {
      merged ??= { ...base };
      merged[key] = fn;
    }
  }
  return merged ?? base;
}
