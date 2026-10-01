// Typed transaction events and errors. sendTx() (lib/kaskad/signer.ts) reports progress as Turkish
// strings; this maps the exact strings to codes the UI can translate, keeping the raw text.
// Pure module: no signer import, safe in tests and on the server.

/** Progress strings produced by the chain layer, verbatim (a test checks they still exist there). */
export const SIGNER_STATUS = {
  /** lib/kaskad/burner.ts:44, only when the burner needs a top-up. */
  funding: "Burner cüzdan hazırlanıyor (sponsor fonluyor)…",
  /** lib/kaskad/signer.ts:108, burner signs locally and sends with eth_sendRawTransactionSync. */
  burnerSending: "Gönderiliyor (eth_sendRawTransactionSync)…",
  /** lib/kaskad/signer.ts:116, Mera passkey key signs and sends. */
  meraSigning: "Mera ile imzalanıyor ve gönderiliyor (eth_sendRawTransactionSync)…",
  /** lib/kaskad/signer.ts:146, browser wallet popup. */
  walletConfirm: "Cüzdanında onayla…",
  /** lib/kaskad/signer.ts:157, browser wallet broadcast; polling the receipt. */
  awaitingReceipt: "Zincirde onay bekleniyor…",
} as const;

/** Error messages thrown by the chain layer, verbatim. */
export const SIGNER_ERRORS = {
  /** lib/kaskad/signer.ts:47 */
  noWallet: "Tarayıcı cüzdanı bulunamadı (MetaMask, Rabby…).",
  /** lib/kaskad/signer.ts:55 */
  noAccount: "Hesap seçilmedi.",
  /** lib/kaskad/signer.ts:113 */
  meraLocked: "Mera oturumu kapalı: Cüzdan sekmesinden yeniden giriş yap.",
  /** lib/kaskad/signer.ts:96-98 (message starts with this) */
  insufficientPrefix: "Bakiye yetersiz:",
  /** lib/kaskad/burner.ts:62 */
  fundingTimeout: "fonlama zaman aşımı",
  /** lib/kaskad/burner.ts:51 fallback and app/api/fund/route.ts:106 (message starts with this) */
  fundingFailedPrefix: "fonlama başarısız",
} as const;

/** `error` bodies of POST /api/fund that burner.ts:51 rethrows (app/api/fund/route.ts). */
export const FUND_ROUTE_ERRORS = {
  unconfigured: "sponsor yapılandırılmamış", // :52
  invalidRequest: "geçersiz istek", // :58
  invalidAddress: "geçersiz adres", // :61
  rateLimited: "çok fazla istek, biraz bekle", // :67
  alreadyFunded: "burner zaten yeterince fonlu", // :75
  sponsorEmpty: "sponsor bakiyesi yetersiz", // :83
} as const;

export type TxStep = "preparing" | "funding" | "signing" | "sending" | "confirming" | "confirmed" | "failed" | "unknown";

export type TxErrorCode =
  | "borrow-paused"
  | "out-of-gas"
  | "funding-failed"
  | "insufficient-balance"
  | "no-wallet"
  | "mera-locked"
  | "rejected"
  | "rate-limited"
  | "unknown";

export type FundingFailure = "rate-limited" | "sponsor-empty" | "already-funded" | "unconfigured" | "invalid-request" | "timeout" | "failed";

export type TxError = { code: TxErrorCode; detail?: FundingFailure; raw: string };

/** One progress event. `raw` is the chain layer's original string ("" for events this layer adds). */
export type TxEvent =
  | { step: "preparing"; detail: "guard-scenario"; raw: string }
  | { step: "funding"; detail: "sponsor"; raw: string }
  | { step: "signing"; detail: "mera" | "wallet"; raw: string }
  | { step: "sending"; detail: "sync"; raw: string }
  | { step: "confirming"; detail: "receipt"; raw: string }
  | { step: "confirmed"; raw: string }
  | { step: "failed"; detail: TxErrorCode | "reverted"; raw: string }
  | { step: "unknown"; raw: string };

/** Maps one onStatus string from sendTx() to a typed event (unknown strings are kept as "unknown"). */
export function toTxEvent(raw: string): TxEvent {
  switch (raw) {
    case SIGNER_STATUS.funding:
      return { step: "funding", detail: "sponsor", raw };
    case SIGNER_STATUS.burnerSending:
      return { step: "sending", detail: "sync", raw };
    case SIGNER_STATUS.meraSigning:
      return { step: "signing", detail: "mera", raw };
    case SIGNER_STATUS.walletConfirm:
      return { step: "signing", detail: "wallet", raw };
    case SIGNER_STATUS.awaitingReceipt:
      return { step: "confirming", detail: "receipt", raw };
    default:
      return { step: "unknown", raw };
  }
}

/** Which /api/fund failure a message is, or null when it is not a funding message. */
export function fundingFailure(raw: string): FundingFailure | null {
  switch (raw) {
    case FUND_ROUTE_ERRORS.rateLimited:
      return "rate-limited";
    case FUND_ROUTE_ERRORS.sponsorEmpty:
      return "sponsor-empty";
    case FUND_ROUTE_ERRORS.alreadyFunded:
      return "already-funded";
    case FUND_ROUTE_ERRORS.unconfigured:
      return "unconfigured";
    case FUND_ROUTE_ERRORS.invalidRequest:
    case FUND_ROUTE_ERRORS.invalidAddress:
      return "invalid-request";
    case SIGNER_ERRORS.fundingTimeout:
      return "timeout";
  }
  return raw.startsWith(SIGNER_ERRORS.fundingFailedPrefix) ? "failed" : null;
}

/** EIP-1193 user rejection (code 4001), anywhere in viem's cause chain. */
function isUserRejection(e: unknown): boolean {
  let c: unknown = e;
  for (let depth = 0; c && depth < 10; depth++) {
    const x = c as { code?: unknown; name?: unknown; cause?: unknown };
    if (x.code === 4001 || x.name === "UserRejectedRequestError") return true;
    c = x.cause;
  }
  return false;
}

/**
 * Error -> typed code. `phase` is the last step seen before the failure: anything thrown while the
 * burner was being funded is a funding failure. BorrowIsPaused matching as in GuardPanel.tsx:159.
 */
export function txError(e: unknown, phase: TxStep | null = null): TxError {
  const raw = String((e as Error)?.message ?? e);
  if (/BorrowIsPaused/.test(raw)) return { code: "borrow-paused", raw };
  if (isUserRejection(e) || raw === SIGNER_ERRORS.noAccount || /user (rejected|denied)/i.test(raw)) return { code: "rejected", raw };
  if (raw.startsWith(SIGNER_ERRORS.insufficientPrefix)) return { code: "insufficient-balance", raw };
  if (raw === SIGNER_ERRORS.noWallet) return { code: "no-wallet", raw };
  if (raw === SIGNER_ERRORS.meraLocked) return { code: "mera-locked", raw };
  const funding = fundingFailure(raw);
  if (funding || phase === "funding") return { code: "funding-failed", detail: funding ?? "failed", raw };
  if (/out of gas|gas required exceeds|intrinsic gas too low/i.test(raw)) return { code: "out-of-gas", raw };
  // RPC proxy limit (app/api/rpc/route.ts:27): viem's HttpRequestError carries the status.
  if (/Status: 429|çok fazla istek/.test(raw)) return { code: "rate-limited", raw };
  return { code: "unknown", raw };
}

export type ConnectErrorCode = "no-wallet" | "rejected" | "failed";
export type ConnectError = { code: ConnectErrorCode; raw: string };

/**
 * Wallet / passkey connection errors (app/(legacy)/baglan/Connect.tsx:90-100 showed the message).
 * WebAuthn cancel / timeout is a DOMException named NotAllowedError.
 */
export function connectError(e: unknown): ConnectError {
  const raw = String((e as Error)?.message ?? e);
  if (raw === SIGNER_ERRORS.noWallet) return { code: "no-wallet", raw };
  if (
    raw === SIGNER_ERRORS.noAccount ||
    isUserRejection(e) ||
    (e as { name?: unknown })?.name === "NotAllowedError" ||
    /user (rejected|denied)/i.test(raw)
  )
    return { code: "rejected", raw };
  return { code: "failed", raw };
}
