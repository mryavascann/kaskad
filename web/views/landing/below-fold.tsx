"use client";

/**
 * The landing's below-the-fold interactive parts as takeover islands (`takeover.tsx`): each shows
 * its static server rendering (`children`: `charts-static.tsx`, `GuardTeaserStatic`,
 * `WalletTeaserStatic`; server components, no client code) from the first paint, with or without
 * JavaScript, and swaps in the live component (a separate chunk, same markup) after the reader's
 * first intent. The sections sit under a 330svh scroll scene, so the live parts are in place before
 * they are reached; there is no timer, so a page that is left alone keeps the static HTML.
 */
import type { FindingGapProps, LivePulseProps, MiniDialProps, ScaleGaugeProps } from "./charts-static";
import type { GuardTeaserProps } from "./guard-cards";
import { takeover } from "./takeover";
import type { WalletSample } from "./wallet-links";
import type { Locale } from "@/i18n/config";

export const LiveFindingGap = takeover<FindingGapProps>(() => import("./charts").then((m) => m.FindingGap));
export const LiveScaleGauge = takeover<ScaleGaugeProps>(() => import("./charts").then((m) => m.ScaleGauge));
export const LivePulse = takeover<LivePulseProps>(() => import("./charts").then((m) => m.LivePulse));
export const LiveMiniDial = takeover<MiniDialProps>(() => import("./charts").then((m) => m.MiniDial));
export const LiveGuardTeaser = takeover<GuardTeaserProps>(() => import("./guard-teaser").then((m) => m.GuardTeaser));
export const LiveWalletTeaser = takeover<{ locale: Locale; samples: readonly WalletSample[] }>(() => import("./wallet-teaser").then((m) => m.WalletTeaser));
