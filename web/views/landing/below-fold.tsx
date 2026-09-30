"use client";

/**
 * The landing's below-the-fold interactive parts, each a separate chunk loaded after the reader
 * engages (`deferred`). The server still renders them in full; see ./deferred.tsx.
 */
import { deferred } from "./deferred";

export const FindingGap = deferred(() => import("./charts").then((m) => m.FindingGap));
export const ScaleGauge = deferred(() => import("./charts").then((m) => m.ScaleGauge));
export const LivePulse = deferred(() => import("./charts").then((m) => m.LivePulse));
export const MiniDial = deferred(() => import("./charts").then((m) => m.MiniDial));
export const GuardTeaser = deferred(() => import("./guard-teaser").then((m) => m.GuardTeaser));
export const OnchainUnlock = deferred(() => import("./onchain-unlock").then((m) => m.OnchainUnlock));
export const WalletTeaser = deferred(() => import("./wallet-teaser").then((m) => m.WalletTeaser));
