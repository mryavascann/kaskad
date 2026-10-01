/**
 * TypeScript mirror of `design/tokens.css`, for code that cannot read CSS variables (three.js
 * materials, canvas, OG images) and for the `/design` page. CSS stays the source of truth;
 * `design/tokens.test.ts` fails when the two drift apart.
 *
 * In components, prefer Tailwind utilities (`text-fg-2`, `bg-elev-1`, `border-line-2`) or
 * `cssVar("liq")`; use `hex` only where a renderer needs sRGB.
 */
import { oklchToHex } from "./color";

export const color = {
  void: "oklch(0.12 0.02 288)",
  bg: "oklch(0.145 0.018 285)",
  "elev-1": "oklch(0.175 0.02 285)",
  "elev-2": "oklch(0.205 0.022 285)",
  "elev-3": "oklch(0.24 0.024 285)",

  line: "oklch(1 0 0 / 0.08)",
  "line-2": "oklch(1 0 0 / 0.14)",
  "line-3": "oklch(1 0 0 / 0.22)",
  "line-strong": "oklch(1 0 0 / 0.36)",

  "fg-1": "oklch(0.96 0.005 285)",
  "fg-2": "oklch(0.8 0.012 285)",
  "fg-3": "oklch(0.66 0.016 285)",
  "fg-4": "oklch(0.52 0.016 285)",

  calm: "oklch(0.72 0.035 245)",
  "calm-hi": "oklch(0.82 0.03 245)",
  warn: "oklch(0.82 0.15 75)",
  "warn-hi": "oklch(0.87 0.11 80)",
  liq: "oklch(0.66 0.22 25)",
  "liq-hi": "oklch(0.72 0.17 25)",
  safe: "oklch(0.78 0.15 160)",
  "safe-hi": "oklch(0.86 0.12 162)",
  monad: "oklch(0.629 0.199 286)",
  "monad-hi": "oklch(0.76 0.12 288)",

  "sev-0": "oklch(0.72 0.035 245)",
  "sev-1": "oklch(0.78 0.09 85)",
  "sev-2": "oklch(0.82 0.15 75)",
  "sev-3": "oklch(0.72 0.17 50)",
  "sev-4": "oklch(0.66 0.22 25)",
} as const;

export type ColorToken = keyof typeof color;

export const colorGroups = {
  surface: ["void", "bg", "elev-1", "elev-2", "elev-3"],
  line: ["line", "line-2", "line-3", "line-strong"],
  text: ["fg-1", "fg-2", "fg-3", "fg-4"],
  status: ["calm", "calm-hi", "warn", "warn-hi", "liq", "liq-hi", "safe", "safe-hi", "monad", "monad-hi"],
  severity: ["sev-0", "sev-1", "sev-2", "sev-3", "sev-4"],
} as const satisfies Record<string, readonly ColorToken[]>;

/** What each color means. Shown on `/design`; also the vocabulary for copy and reviews. */
export const colorRole: Record<ColorToken, string> = {
  void: "3D stage behind the hero",
  bg: "Page background",
  "elev-1": "Panels, cards",
  "elev-2": "Raised: inputs, popovers, hover",
  "elev-3": "Highest: tooltips, active items",
  line: "Hairlines, grid",
  "line-2": "Panel borders, dividers",
  "line-3": "Hover borders, emphasized rules",
  "line-strong": "Input borders (3:1 non-text contrast)",
  "fg-1": "Primary text, hero numbers",
  "fg-2": "Secondary text",
  "fg-3": "Labels, captions (AA on every surface)",
  "fg-4": "Large text, disabled, non-text marks only",
  calm: "Calm state, safe positions in a scene",
  "calm-hi": "Calm text on tinted fills",
  warn: "Below threshold, stuck debt",
  "warn-hi": "Warn text on tinted fills",
  liq: "Liquidation, bad debt, alarms",
  "liq-hi": "Liquidation text on tinted fills",
  safe: "Protected, healthy, confirmed",
  "safe-hi": "Safe text on tinted fills",
  monad: "Monad accent, used sparingly",
  "monad-hi": "Focus ring, Monad text",
  "sev-0": "Severity 0: calm",
  "sev-1": "Severity 1: early warning",
  "sev-2": "Severity 2: warning",
  "sev-3": "Severity 3: critical",
  "sev-4": "Severity 4: liquidation",
};

/** `var(--color-…)` reference, for inline styles and SVG attributes. */
export const cssVar = (token: ColorToken) => `var(--color-${token})`;

/** sRGB hex (alpha dropped) for renderers that cannot parse `oklch()`. */
export const hex = Object.fromEntries(
  Object.entries(color).map(([name, value]) => [name, oklchToHex(value)]),
) as Record<ColorToken, string>;

export type TypeToken = {
  size: string;
  lineHeight: string;
  letterSpacing?: string;
  fontWeight?: string;
  family: "sans" | "mono";
  role: string;
};

export const type = {
  "display-xl": { size: "clamp(3.25rem, 1.9rem + 5.6vw, 7rem)", lineHeight: "0.94", letterSpacing: "-0.045em", fontWeight: "500", family: "sans", role: "Landing hero headline" },
  display: { size: "clamp(2.5rem, 1.7rem + 3.4vw, 4.75rem)", lineHeight: "0.98", letterSpacing: "-0.04em", fontWeight: "500", family: "sans", role: "Section headline" },
  "title-1": { size: "clamp(2rem, 1.55rem + 1.9vw, 3.25rem)", lineHeight: "1.04", letterSpacing: "-0.032em", fontWeight: "500", family: "sans", role: "Page title" },
  "title-2": { size: "clamp(1.5rem, 1.3rem + 0.85vw, 2rem)", lineHeight: "1.12", letterSpacing: "-0.022em", fontWeight: "500", family: "sans", role: "Panel / block title" },
  "title-3": { size: "1.25rem", lineHeight: "1.3", letterSpacing: "-0.012em", fontWeight: "500", family: "sans", role: "Card title" },
  lead: { size: "clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)", lineHeight: "1.5", letterSpacing: "-0.006em", family: "sans", role: "Intro paragraph" },
  body: { size: "1rem", lineHeight: "1.6", family: "sans", role: "Body copy" },
  "body-sm": { size: "0.875rem", lineHeight: "1.55", family: "sans", role: "Dense UI copy" },
  caption: { size: "0.8125rem", lineHeight: "1.45", family: "sans", role: "Captions, footnotes" },
  label: { size: "0.6875rem", lineHeight: "1.35", letterSpacing: "0.16em", family: "mono", role: "Mono labels, uppercase" },
  "metric-xl": { size: "clamp(2.75rem, 1.6rem + 4.8vw, 5.5rem)", lineHeight: "1", letterSpacing: "-0.04em", fontWeight: "450", family: "mono", role: "Hero metric" },
  "metric-lg": { size: "clamp(2.125rem, 1.6rem + 2.2vw, 3.5rem)", lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "450", family: "mono", role: "Result metric" },
  "metric-md": { size: "clamp(1.5rem, 1.3rem + 0.8vw, 2rem)", lineHeight: "1.1", letterSpacing: "-0.025em", fontWeight: "450", family: "mono", role: "Stat" },
  "metric-sm": { size: "1.125rem", lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "450", family: "mono", role: "Inline value" },
} as const satisfies Record<string, TypeToken>;

export type TypeName = keyof typeof type;

export const radius = { tag: 4, control: 7, panel: 10, sheet: 14 } as const;

export const layout = {
  /** px */
  containerPage: 1440,
  containerDoc: 736,
  columns: { base: 4, md: 8, lg: 12 },
  /** Tailwind default breakpoints, px */
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 },
  /** px, per breakpoint (base / sm / lg / page) */
  gutter: { base: 16, sm: 24, lg: 40, page: 60 },
  gap: { base: 16, lg: 24 },
} as const;
