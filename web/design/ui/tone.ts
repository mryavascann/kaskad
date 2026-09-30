import { Activity, Box, Info, OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";

/**
 * Semantic tones shared by every component. A tone is never the only signal: components that take
 * a tone also render its icon or a text label (color-blind safe, WCAG 1.4.1).
 */
export type Tone = "neutral" | "calm" | "warn" | "liq" | "safe" | "monad";

export const TONES: readonly Tone[] = ["neutral", "calm", "warn", "liq", "safe", "monad"];

/** Readable text color for small text in that tone (AA on every surface). */
export const toneText: Record<Tone, string> = {
  neutral: "text-fg-2",
  calm: "text-calm-hi",
  warn: "text-warn",
  liq: "text-liq-hi",
  safe: "text-safe",
  monad: "text-monad-hi",
};

/** Solid mark color: dots, bars, strokes, big numbers. */
export const toneSolid: Record<Tone, string> = {
  neutral: "text-fg-1",
  calm: "text-calm",
  warn: "text-warn",
  liq: "text-liq",
  safe: "text-safe",
  monad: "text-monad",
};

export const toneBg: Record<Tone, string> = {
  neutral: "bg-fg-3",
  calm: "bg-calm",
  warn: "bg-warn",
  liq: "bg-liq",
  safe: "bg-safe",
  monad: "bg-monad",
};

/** Tinted surface + border for tags, callouts and highlighted panels. */
export const toneSoft: Record<Tone, string> = {
  neutral: "bg-elev-2 border-line-2",
  calm: "bg-calm/8 border-calm/30",
  warn: "bg-warn/8 border-warn/35",
  liq: "bg-liq/10 border-liq/45",
  safe: "bg-safe/8 border-safe/35",
  monad: "bg-monad/10 border-monad/40",
};

export const toneGlow: Record<Tone, string> = {
  neutral: "",
  calm: "",
  warn: "shadow-glow-warn",
  liq: "shadow-glow-liq",
  safe: "shadow-glow-safe",
  monad: "shadow-glow-monad",
};

/** Default icon per tone. Liquidation is an alarm (octagon), not a generic error cross. */
export const toneIcon: Record<Tone, LucideIcon> = {
  neutral: Info,
  calm: Activity,
  warn: TriangleAlert,
  liq: OctagonAlert,
  safe: ShieldCheck,
  monad: Box,
};
