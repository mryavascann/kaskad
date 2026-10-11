/** Shared transport/funding bounds; no credentials or server dependencies. */
export const RPC_BATCH_LIMIT = 10;
export const SPONSOR_GRANT_WEI = 10n ** 18n;
// Covers the app's 30M gas ceiling at its 150 gwei max fee (4.5 MON).
export const SPONSOR_TARGET_WEI = 45n * 10n ** 17n;
export const SPONSOR_TOP_UPS = 5;
