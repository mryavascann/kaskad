import type { RouteId } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";

/** The pages in the nav (bar and mobile menu), in order. */
export const NAV_LINKS: { route: RouteId; key: keyof CommonMessages["nav"] }[] = [
  { route: "app", key: "console" },
  { route: "wallet", key: "wallet" },
  { route: "guard", key: "guard" },
  { route: "replay", key: "replay" },
  { route: "how", key: "how" },
];
