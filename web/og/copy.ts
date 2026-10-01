/**
 * Copy for the Open Graph cards, per page and locale. Titles are short (they sit at 64px on a
 * 1200×630 card); `alt` describes the card for the `og:image:alt` tag. TR `satisfies` the EN shape.
 */
import type { Locale } from "@/i18n/config";

export type OgPage = "home" | "app" | "wallet" | "guard" | "how";

const en = {
  brand: "Kaskad",
  network: "Monad testnet",
  block: "block",
  pages: {
    home: {
      kicker: "On-chain liquidation cascade engine",
      title: "One transaction. Every liquidation wave.",
      alt: "Kaskad: one transaction replays every liquidation wave on Monad, with the live finding on the real Aave book.",
    },
    app: {
      kicker: "Console",
      title: "Stress-test the real Aave book on Monad.",
      alt: "Kaskad console: pick a shock, preview the cascade for free, prove it on-chain in one transaction.",
    },
    wallet: {
      kicker: "Read only",
      title: "Is my position safe?",
      alt: "Kaskad: check how an Aave position on Monad holds up in the next liquidation cascade.",
    },
    guard: {
      kicker: "KaskadGuard",
      title: "A circuit breaker that reads the cascade.",
      alt: "KaskadGuard: an on-chain circuit breaker that runs the cascade and pauses borrowing when bad debt crosses its threshold.",
    },
    how: {
      kicker: "Methodology",
      title: "The model, the data, the proofs.",
      alt: "How Kaskad works: the model, the data, the assumptions and the on-chain proofs.",
    },
  },
  finding: {
    kicker: "Live finding",
    stuck: "Stuck debt",
    cleared: "Cleared by liquidators",
    gap: "Gap",
    realBook: "real Aave book",
    positions: "positions",
  },
  guard: {
    kicker: "Live rule",
    trigger: "Trips at bad debt above",
    safeLtv: "Then caps max LTV at",
    market: "Guarded market",
    paused: "Borrowing paused",
    open: "Borrowing open",
    scenario: "Scenario",
  },
  snapshot: "Borrower snapshot: Monad mainnet Aave, block",
};

export type OgCopy = typeof en;

const tr = {
  brand: "Kaskad",
  network: "Monad testnet",
  block: "blok",
  pages: {
    home: {
      kicker: "Zincir üstü likidasyon kaskadı motoru",
      title: "Tek işlem. Tüm likidasyon dalgaları.",
      alt: "Kaskad: tek işlem Monad'da tüm likidasyon dalgalarını yeniden oynatır; gerçek Aave defterindeki canlı bulguyla.",
    },
    app: {
      kicker: "Konsol",
      title: "Monad'daki gerçek Aave defterini sına.",
      alt: "Kaskad konsolu: bir şok seç, kaskadı ücretsiz önizle, tek işlemle zincirde kanıtla.",
    },
    wallet: {
      kicker: "Salt okunur",
      title: "Param güvende mi?",
      alt: "Kaskad: Monad'daki bir Aave pozisyonunun bir sonraki likidasyon kaskadında nasıl dayandığını kontrol et.",
    },
    guard: {
      kicker: "KaskadGuard",
      title: "Kaskadı okuyan bir devre kesici.",
      alt: "KaskadGuard: kaskadı çalıştıran ve karşılıksız borç eşiği aşılınca borç vermeyi durduran zincir üstü devre kesici.",
    },
    how: {
      kicker: "Yöntem",
      title: "Model, veri, kanıtlar.",
      alt: "Kaskad nasıl çalışır: model, veri, varsayımlar ve zincirdeki kanıtlar.",
    },
  },
  finding: {
    kicker: "Canlı bulgu",
    stuck: "Sıkışan borç",
    cleared: "Likidatörlerin temizlediği",
    gap: "Fark",
    realBook: "gerçek Aave defteri",
    positions: "pozisyon",
  },
  guard: {
    kicker: "Canlı kural",
    trigger: "Tetiklendiği karşılıksız borç",
    safeLtv: "Sonra azami LTV",
    market: "Korunan piyasa",
    paused: "Borç verme durdu",
    open: "Borç verme açık",
    scenario: "Senaryo",
  },
  snapshot: "Borçlu verisi: Monad mainnet Aave, blok",
} satisfies OgCopy;

export const ogCopy: Record<Locale, OgCopy> = { en, tr };

/** `og:image:alt` for a page. */
export const ogAlt = (page: OgPage, locale: Locale): string => ogCopy[locale].pages[page].alt;
