// What a transaction will cost before it is sent (Monad charges the gas limit). Logic copied from
// app/_components/CostTag.tsx; the blocking window.confirm became an injectable ConfirmCost.

import type { SignerKind } from "@/lib/kaskad/signer";
import { monCost } from "@/lib/kaskad/math";

/** Below this the tag shows "<0.01 MON" (CostTag.tsx:11). */
export const MIN_DISPLAY_MON = 0.01;
/** At or above this a tx is "heavy" and must be confirmed first (CostTag.tsx:20, :32). */
export const CONFIRM_THRESHOLD_MON = 1;

/** Who pays: the sponsor (burner and Mera passkey are topped up by /api/fund), or the user's browser wallet. */
export type Payer = "sponsor" | "wallet";
export const payerFor = (kind: SignerKind): Payer => (kind === "injected" ? "wallet" : "sponsor");

export type CostQuote = {
  gasLimit: bigint;
  /** MON = gas limit x 102 gwei (lib/kaskad/math.ts monCost). Display with 2 decimals, "~" prefix. */
  mon: number;
  /** Show "<0.01 MON" instead of the number. */
  belowMinDisplay: boolean;
  /** >= 1 MON: warn, and confirm before sending. */
  heavy: boolean;
  payer: Payer;
};

/** CostTag.tsx:9-27 (fmtMon + payer + heavy) as data. */
export function quoteCost(gasLimit: bigint, signer: SignerKind): CostQuote {
  const mon = monCost(gasLimit);
  return {
    gasLimit,
    mon,
    belowMinDisplay: mon < MIN_DISPLAY_MON,
    heavy: mon >= CONFIRM_THRESHOLD_MON,
    payer: payerFor(signer),
  };
}

/** The >= 1 MON rule (CostTag.tsx:30-32). */
export const needsConfirm = (gasLimit: bigint): boolean => monCost(gasLimit) >= CONFIRM_THRESHOLD_MON;

/** Injected confirmation UI; resolve true to send. Only called for quotes that need it. */
export type ConfirmCost = (quote: CostQuote) => boolean | Promise<boolean>;

export type ConfirmDecision = "not-needed" | "approved" | "declined" | "confirm-required";

/**
 * confirmCost() without window.confirm (CostTag.tsx:30-35): under 1 MON no question; at or above,
 * ask `confirm`. Without a confirm function a heavy tx is refused ("confirm-required").
 */
export async function decideCost(gasLimit: bigint, signer: SignerKind, confirm?: ConfirmCost): Promise<ConfirmDecision> {
  if (!needsConfirm(gasLimit)) return "not-needed";
  if (!confirm) return "confirm-required";
  return (await confirm(quoteCost(gasLimit, signer))) ? "approved" : "declined";
}
