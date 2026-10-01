/**
 * The "Instrument" OG card: dark surface, hairline grid, corner ticks, a tick ruler along the bottom,
 * Geist for the title and Geist Mono for labels and numbers. Satori (ImageResponse) supports flexbox
 * only, so every element with more than one child is `display: flex`.
 */
import { ImageResponse } from "next/og";
import { hex } from "@/design/tokens";
import { ogFonts } from "./fonts";
import type { OgCard, OgTone } from "./format";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const W = OG_SIZE.width;
const H = OG_SIZE.height;
const PAD = 72;

/** Lines are white at low alpha in tokens.css; `hex` drops alpha, so they are spelled out here. */
const line = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;

const TONE: Record<OgTone, string> = {
  fg: hex["fg-1"],
  warn: hex.warn,
  liq: hex["liq-hi"],
  safe: hex.safe,
  monad: hex["monad-hi"],
};

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect x="0" y="2" width="8" height="26" fill={hex["fg-1"]} />
      <rect x="10" y="10" width="8" height="18" fill={hex["fg-1"]} />
      <rect x="20" y="16" width="8" height="12" fill={hex.liq} transform="rotate(14 28 28)" />
    </svg>
  );
}

/**
 * Decoration in one SVG under the content: hairline grid, corner ticks, and a ruler along the bottom
 * edge (a tick every 12px, a taller one every 60px). Coordinates are whole pixels.
 */
function Decoration() {
  const grid: string[] = [];
  for (let x = 120; x < W; x += 120) grid.push(`M${x} 0V${H}`);
  for (let y = 105; y < H; y += 105) grid.push(`M0 ${y}H${W}`);
  const minor: string[] = [];
  const major: string[] = [];
  const base = H - 40;
  for (let x = PAD, i = 0; x <= W - PAD; x += 12, i++) (i % 5 === 0 ? major : minor).push(`M${x} ${base}v${i % 5 === 0 ? -14 : -7}`);
  const arm = 18;
  const inset = 28;
  const corners = [
    `M${inset} ${inset + arm}V${inset}H${inset + arm}`,
    `M${W - inset - arm} ${inset}H${W - inset}V${inset + arm}`,
    `M${inset} ${H - inset - arm}V${H - inset}H${inset + arm}`,
    `M${W - inset - arm} ${H - inset}H${W - inset}V${H - inset - arm}`,
  ];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <path d={grid.join("")} stroke={line(0.035)} strokeWidth={1} />
      <path d={minor.join("")} stroke={line(0.18)} strokeWidth={1} />
      <path d={major.join("")} stroke={line(0.36)} strokeWidth={1} />
      <path d={corners.join("")} stroke={line(0.36)} strokeWidth={1} fill="none" />
    </svg>
  );
}

/** The card as a plain element tree (exported for tests of the structure, not of pixels). */
export function OgCardElement({ card, brand }: { card: OgCard; brand: string }) {
  const hasMetrics = card.metrics.length > 0;
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: hex.bg,
        color: hex["fg-1"],
        fontFamily: "Geist",
      }}
    >
      <Decoration />

      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${PAD - 8}px ${PAD}px ${PAD + 24}px` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Mark size={34} />
            <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.04em" }}>{brand}</div>
          </div>
          {card.status ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "Geist Mono",
                fontSize: 17,
                letterSpacing: "0.12em",
                color: hex["fg-3"],
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 9, background: hex.safe }} />
              {card.status}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: hasMetrics ? 58 : 110, gap: 22 }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 19, letterSpacing: "0.16em", color: hex["fg-3"] }}>{card.kicker}</div>
          <div style={{ fontSize: hasMetrics ? 62 : 80, fontWeight: 500, lineHeight: 1.04, letterSpacing: "-0.035em", maxWidth: 1000 }}>
            {card.title}
          </div>
        </div>

        {hasMetrics ? (
          <div style={{ display: "flex", marginTop: "auto", borderTop: `1px solid ${line(0.14)}` }}>
            {card.metrics.map((m, i) => (
              <div
                key={m.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  gap: 10,
                  paddingTop: 22,
                  paddingLeft: i === 0 ? 0 : 28,
                  borderLeft: i === 0 ? "none" : `1px solid ${line(0.14)}`,
                }}
              >
                <div style={{ fontFamily: "Geist Mono", fontSize: 15, letterSpacing: "0.14em", color: hex["fg-3"] }}>{m.label}</div>
                <div
                  style={{
                    fontFamily: m.kind === "text" ? "Geist" : "Geist Mono",
                    fontSize: m.kind === "text" ? 38 : 56,
                    fontWeight: 500,
                    lineHeight: 1.1,
                    letterSpacing: m.kind === "text" ? "-0.02em" : "-0.04em",
                    color: TONE[m.tone],
                  }}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {card.source ? (
          <div style={{ display: "flex", marginTop: hasMetrics ? 18 : "auto", fontFamily: "Geist Mono", fontSize: 16, color: hex["fg-3"] }}>
            {card.source}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function renderOgCard(card: OgCard, brand: string): Promise<ImageResponse> {
  return new ImageResponse(<OgCardElement card={card} brand={brand} />, { ...OG_SIZE, fonts: await ogFonts() });
}
