/**
 * The static server renderings match the live components they are swapped for (same box in every
 * state, no layout shift at the takeover): the same DOM at the live component's first render.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { landingMessages } from "@/i18n/messages/landing";
import { walletMessages } from "@/i18n/messages/wallet";
import { MARKETS } from "@/lib/chain/guard";
import { mockMatchMedia } from "@/motion/test-utils";

mockMatchMedia();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/chain/hooks/useLiveBlock", () => ({ useLiveBlock: () => ({ block: null, updatedAt: null, error: null }) }));

const live = await import("./charts");
const stat = await import("./charts-static");
const { GuardTeaser } = await import("./guard-teaser");
const { GuardTeaserStatic } = await import("./guard-cards");
const { WalletTeaser } = await import("./wallet-teaser");
const { WalletTeaserStatic } = await import("./wallet-teaser-static");
const { WALLET_SAMPLES } = await import("./landing");
const { recordedLanding, EMPTY_LANDING } = await import("./__fixtures__/landing-data");

const data = recordedLanding();
const t = landingMessages.en;

/** The DOM of a render, styles normalized; Motion's resting `transform: none` (live fills at full scale) is dropped. */
function dom(element: ReactElement): HTMLElement {
  const box = document.createElement("div");
  box.innerHTML = renderToStaticMarkup(element);
  for (const el of box.querySelectorAll<HTMLElement>("[style]")) {
    if (el.style.transform === "none") el.style.removeProperty("transform");
    // One serialization of the declarations (React and Motion write them differently).
    if (el.style.cssText) el.setAttribute("style", el.style.cssText);
    else el.removeAttribute("style");
  }
  return box;
}

function same(a: ReactElement, b: ReactElement) {
  const x = dom(a);
  const y = dom(b);
  expect(x.innerHTML.length).toBeGreaterThan(0);
  // isEqualNode ignores attribute order; the HTML is in the message when it fails.
  if (!x.isEqualNode(y)) expect(y.innerHTML).toBe(x.innerHTML);
}

describe.each([
  ["recorded data", data],
  ["no data (skeletons)", EMPTY_LANDING],
])("static = live markup, %s", (_, d) => {
  const gap = { locale: "en" as const, cleared: d.finding?.clearedUsd ?? null, stuck: d.finding?.stuckDebtUsd ?? null, copy: t.finding.gap, footnote: <small>note</small> };
  const gauge = { locale: "en" as const, facts: d.scale?.facts ?? null, copy: t.monad.gas.copy };
  const dial = { locale: "en" as const, value: d.positions?.largest?.healthFactor ?? null, copy: walletMessages.en.dial, caption: "caption" };

  it("GapBars", () => same(<stat.FindingGapStatic {...gap} />, <live.FindingGap {...gap} />));
  it("GasGauge", () => same(<stat.ScaleGaugeStatic {...gauge} />, <live.ScaleGauge {...gauge} />));
  it("BlockPulse", () => same(<stat.LivePulseStatic locale="en" copy={t.monad.blocks.pulse} />, <live.LivePulse locale="en" copy={t.monad.blocks.pulse} />));
  it("HealthDial", () => same(<stat.MiniDialStatic {...dial} />, <live.MiniDial {...dial} />));
});

describe("static = live markup, teasers", () => {
  const guarded = { a: MARKETS.a.guarded, b: MARKETS.b.guarded };
  it.each([
    ["read", { a: { paused: false, maxLtvBps: 9_000 }, b: { paused: true, maxLtvBps: 7_000 } }],
    ["unread", null],
  ])("GuardTeaser (%s)", (_, markets) => {
    same(<GuardTeaserStatic locale="en" markets={markets} guarded={guarded} />, <GuardTeaser locale="en" markets={markets} guarded={guarded} />);
  });

  it.each(["en", "tr"] as const)("WalletTeaser (%s): a GET form to the wallet page", (locale) => {
    same(<WalletTeaserStatic locale={locale} samples={WALLET_SAMPLES} />, <WalletTeaser locale={locale} samples={WALLET_SAMPLES} />);
    const form = dom(<WalletTeaserStatic locale={locale} samples={WALLET_SAMPLES} />).querySelector("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe(locale === "en" ? "/wallet" : "/tr/cuzdan");
    expect(form.querySelector("input")!.getAttribute("name")).toBe("address");
  });
});
