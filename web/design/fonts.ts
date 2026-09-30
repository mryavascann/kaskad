import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

// `subsets` only controls preloading: latin-ext (Turkish ğ, ş, ı, İ) is still served on demand
// through the unicode-range of the generated @font-face rules.

/** Headlines and UI copy. */
export const fontSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });

/** Every number and label. Tabular figures are switched on globally in design/base.css. */
export const fontMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

/**
 * Accent only: one or two italic words in a headline. Not preloaded: a preload would compete with
 * the render-critical requests for one word; `swap` shows the metric-adjusted fallback until it lands.
 */
export const fontSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/** Class names that define the three font variables; put them on <html>. */
export const fontVariables = [fontSans.variable, fontMono.variable, fontSerif.variable].join(" ");
