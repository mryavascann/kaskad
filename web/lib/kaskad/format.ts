const tr = (n: number, digits = 1) => n.toLocaleString("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** $115,9M style (Turkish decimal comma). */
export function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${tr(n / 1e9, 2)} Mr`;
  if (a >= 1e6) return `$${tr(n / 1e6, 1)}M`;
  if (a >= 1e3) return `$${tr(n / 1e3, 1)}K`;
  return `$${tr(n, 0)}`;
}

export const fmtNum = (n: number | bigint, digits = 0) => tr(Number(n), digits);
export const fmtPct = (x: number, digits = 1) => `%${tr(x * 100, digits)}`;
export const wadToNum = (w: bigint) => Number(w / 10n ** 12n) / 1e6;

export function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return `${tr(b / 1024 / 1024, 2)} MB`;
  if (b >= 1024) return `${tr(b / 1024, 0)} KB`;
  return `${b} B`;
}

export function fmtGas(g: number): string {
  if (g >= 1e6) return `${tr(g / 1e6, 2)}M`;
  if (g >= 1e3) return `${tr(g / 1e3, 0)}k`;
  return `${g}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
