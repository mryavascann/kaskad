/**
 * Copy shared by every transaction flow (Guard, console proofs, borrow): cost line, progress steps,
 * typed errors from lib/chain/status.ts and the >= 1 MON confirmation. Turkish mirrors English.
 */
import type { FundingFailure, TxErrorCode } from "@/lib/chain/status";
import type { SignerKind } from "@/lib/kaskad/signer";
import type { Locale } from "../config";

const en = {
  cost: {
    free: "Free · eth_call, nothing is written on chain",
    payer: { sponsor: "testnet, the sponsor pays", wallet: "testnet, from your wallet" } as Record<"sponsor" | "wallet", string>,
    heavy: "expensive: you will be asked to confirm",
    label: "Estimated cost",
  },
  signer: {
    label: "Paying with",
    kinds: { burner: "Temporary wallet (sponsored)", injected: "Browser wallet", mera: "Mera passkey" } as Record<SignerKind, string>,
  },
  steps: {
    check: "Free pre-check (eth_call)",
    prepare: "Preparing the scenario",
    fund: "Sponsor tops up the gas",
    sign: "Signing",
    send: "Sending",
    confirm: "Receipt",
  },
  stepStatus: { pending: "waiting", active: "in progress", done: "done", error: "failed" },
  result: {
    confirmed: (v: { ms: string; sync: boolean }) => `Confirmed in ${v.ms}${v.sync ? ", receipt in the same call" : ""}`,
    reverted: "Reverted on chain. The gas was still charged.",
    cancelled: "Not sent.",
    open: "Open on MonadScan",
  },
  errors: {
    "borrow-paused": "Reverted: BorrowIsPaused. The Guard has paused this market.",
    "too-soon": "Reverted: TooSoon. This asset was published moments ago; the cooldown is still running. Nothing was spent.",
    "out-of-gas": "Does not fit in one transaction (30M gas).",
    "funding-failed": "The sponsor could not top up the gas.",
    "insufficient-balance": "Not enough testnet MON in this wallet.",
    "no-wallet": "No browser wallet found.",
    "mera-locked": "Sign in with your passkey and try again.",
    rejected: "The request was rejected in the wallet.",
    "rate-limited": "Too many requests. Try again in a few seconds.",
    unknown: "Something went wrong.",
  } as Record<TxErrorCode, string>,
  funding: {
    "rate-limited": "The sponsor is rate-limited. Try again in a few minutes.",
    "sponsor-empty": "The sponsor is out of testnet MON.",
    "already-funded": "The wallet already has enough MON.",
    unconfigured: "The sponsor is not configured on this deployment.",
    "invalid-request": "The funding request was rejected.",
    timeout: "Funding took too long.",
    failed: "Funding failed.",
  } as Record<FundingFailure, string>,
  confirm: {
    title: "Send this transaction?",
    description: (v: { mon: string; payer: string }) => `It costs about ${v.mon} (${v.payer}). Monad charges the gas limit, so this is the exact cost.`,
    confirm: "Send",
    cancel: "Cancel",
  },
};

export type TxMessages = typeof en;

const tr = {
  cost: {
    free: "Ücretsiz · eth_call, zincire hiçbir şey yazılmaz",
    payer: { sponsor: "testnet, sponsor öder", wallet: "testnet, senin cüzdanından" } as Record<"sponsor" | "wallet", string>,
    heavy: "pahalı: göndermeden önce onay istenir",
    label: "Tahmini maliyet",
  },
  signer: {
    label: "Ödeyen",
    kinds: { burner: "Geçici cüzdan (sponsorlu)", injected: "Tarayıcı cüzdanı", mera: "Mera passkey" } as Record<SignerKind, string>,
  },
  steps: {
    check: "Ücretsiz ön kontrol (eth_call)",
    prepare: "Senaryo hazırlanıyor",
    fund: "Sponsor gas'ı yüklüyor",
    sign: "İmzalanıyor",
    send: "Gönderiliyor",
    confirm: "Receipt",
  },
  stepStatus: { pending: "bekliyor", active: "sürüyor", done: "tamam", error: "başarısız" },
  result: {
    confirmed: (v: { ms: string; sync: boolean }) => `${v.ms} içinde onaylandı${v.sync ? ", receipt aynı çağrıda" : ""}`,
    reverted: "Zincirde revert oldu. Gas yine de ödendi.",
    cancelled: "Gönderilmedi.",
    open: "MonadScan'de aç",
  },
  errors: {
    "borrow-paused": "Revert: BorrowIsPaused. Guard bu piyasayı durdurdu.",
    "too-soon": "Revert: TooSoon. Bu varlık az önce yayınlandı, bekleme süresi dolmadı. Hiçbir şey harcanmadı.",
    "out-of-gas": "Tek işleme sığmıyor (30M gas).",
    "funding-failed": "Sponsor gas'ı yükleyemedi.",
    "insufficient-balance": "Bu cüzdanda yeterli testnet MON yok.",
    "no-wallet": "Tarayıcı cüzdanı bulunamadı.",
    "mera-locked": "Passkey ile giriş yapıp tekrar dene.",
    rejected: "İstek cüzdanda reddedildi.",
    "rate-limited": "Çok fazla istek. Birkaç saniye sonra tekrar dene.",
    unknown: "Bir şeyler ters gitti.",
  } as Record<TxErrorCode, string>,
  funding: {
    "rate-limited": "Sponsor hız sınırında. Birkaç dakika sonra tekrar dene.",
    "sponsor-empty": "Sponsorun testnet MON'u bitti.",
    "already-funded": "Cüzdanda zaten yeterli MON var.",
    unconfigured: "Bu kurulumda sponsor ayarlı değil.",
    "invalid-request": "Fonlama isteği reddedildi.",
    timeout: "Fonlama çok uzun sürdü.",
    failed: "Fonlama başarısız.",
  } as Record<FundingFailure, string>,
  confirm: {
    title: "Bu işlem gönderilsin mi?",
    description: (v: { mon: string; payer: string }) => `Maliyeti yaklaşık ${v.mon} (${v.payer}). Monad gas limitini keser, yani bu kesin maliyettir.`,
    confirm: "Gönder",
    cancel: "Vazgeç",
  },
} satisfies TxMessages;

export const txMessages: Record<Locale, TxMessages> = { en, tr };
