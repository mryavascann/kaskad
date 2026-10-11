/** Shared transport/funding bounds; no credentials or server dependencies. */
export const RPC_BATCH_LIMIT = 10;
export const SPONSOR_GRANT_WEI = 10n ** 18n;
// Covers the app's 30M gas ceiling at its 150 gwei max fee (4.5 MON).
export const SPONSOR_TARGET_WEI = 45n * 10n ** 17n;
export const SPONSOR_TOP_UPS = 5;
export const SPONSOR_RESERVE_WEI = 10n * 10n ** 18n;
export const SPONSOR_MIN_GRANT_WEI = 3n * 10n ** 17n;
export const SPONSOR_TRANSFER_GAS = 21_000n;
// Attempts in a fixed 24-hour window starting with the first reservation, not a calendar day.
export const SPONSOR_DAILY_GRANTS = 20;
