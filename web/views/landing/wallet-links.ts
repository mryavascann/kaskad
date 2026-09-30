/**
 * The wallet teaser's pure parts (server-safe, shared by `WalletTeaserStatic` and the live
 * `WalletTeaser`): the sample borrower shape, the address shape check and the wallet page's URL.
 */
import { href, type Locale } from "@/i18n/config";

/** A sample borrower as the server passes it: id (copy key), address and its short form. */
export type WalletSample = { id: string; address: string; short: string; description: string };

/** The address field's id: the same in the static and the live form, so the markup matches. */
export const WALLET_INPUT_ID = "landing-wallet-address";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Shape check for navigation only: `0x` and 40 hex digits (any case). */
export function looksLikeAddress(value: string): boolean {
  return ADDRESS.test(value);
}

/** `/wallet?address=0x…` (or `/tr/cuzdan?address=…`) for a checked address. */
export function walletHref(locale: Locale, address: string): string {
  return `${href("wallet", locale)}?address=${encodeURIComponent(address)}`;
}
