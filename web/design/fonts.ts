import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

// `subsets` only controls preloading: latin-ext (Turkish ğ, ş, ı, İ) is still served on demand
// through the unicode-range of the generated @font-face rules.

/** Headlines and UI copy. */
export const fontSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });

/** Every number and label. Tabular figures are switched on globally in design/base.css. */
export const fontMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

/**
 * Accent only: one or two italic words in a headline. Still preloaded (15 KB woff2): measured without the
 * preload, the late swap of the hero's italic word reflowed the landing hero (CLS 0.074 on mobile
 * Lighthouse, target < 0.05).
 */
export const fontSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
  display: "swap",
});

/** Class names that define the three font variables; put them on <html>. */
export const fontVariables = [fontSans.variable, fontMono.variable, fontSerif.variable].join(" ");
