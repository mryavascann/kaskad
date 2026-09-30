/**
 * Shell copy (navigation, footer, shared labels) in both languages. English is the source; the
 * Turkish object must have the same shape (`satisfies CommonMessages`), so a missing translation is a
 * type error. Page copy lives in one file per page next to this one.
 */
import type { Locale } from "../config";

const en = {
  brand: "Kaskad",
  meta: {
    title: "Kaskad · On-chain liquidation cascade engine on Monad",
    description:
      "What happens if an asset drops 3%? Kaskad replays the liquidation cascade across the real Aave book on Monad, in one transaction anyone can verify.",
  },
  placeholder: {
    kicker: "Being rebuilt",
    body: "This page is part of the Metropolis rebuild and lands in the next stage.",
  },
  skipToContent: "Skip to content",
  nav: {
    label: "Main",
    console: "Console",
    wallet: "Is my position safe?",
    guard: "Guard",
    how: "How it works",
    cta: "Run the stress test",
    menu: "Menu",
    closeMenu: "Close menu",
  },
  network: {
    name: "Monad testnet",
    block: "Block",
    connecting: "Connecting",
    offline: "RPC unreachable",
    liveLabel: "Latest Monad testnet block",
  },
  locale: {
    label: "Language",
    switchTo: "Türkçe",
    switchToShort: "TR",
    current: "English",
  },
  badge: {
    winner: "Winner",
    /** Event name: always rendered with lang="en" so Turkish uppercase rules don't turn "Blitz" into "BLİTZ". */
    event: "Monad Blitz İstanbul v2",
  },
  footer: {
    tagline: "On-chain liquidation cascade engine. One transaction, every liquidation wave.",
    builtWith: "Built with",
    tools: ["Monad testnet", "Aave data", "Envio HyperSync", "Alchemy", "Mera"],
    contracts: "Contracts on Monad testnet",
    contractNames: {
      kaskad: "Kaskad engine",
      kaskadMC: "KaskadMC (Monte Carlo)",
      guard: "KaskadGuard",
      marketA: "Market A (unprotected)",
      marketB: "Market B (guarded)",
    },
    snapshot: "Borrower snapshot",
    /** English term, rendered with lang="en". */
    snapshotSource: "Monad mainnet Aave",
    snapshotBlock: "block",
    source: "Source code",
    github: "GitHub",
    explorer: "MonadScan",
    externalHint: "opens in a new tab",
  },
  common: {
    loading: "Loading",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
  },
};

export type CommonMessages = typeof en;

const tr = {
  brand: "Kaskad",
  meta: {
    title: "Kaskad · Monad'da zincir üstü likidasyon kaskadı motoru",
    description:
      "Bir varlık %3 düşerse ne olur? Kaskad, Monad'daki gerçek Aave defterinde likidasyon kaskadını herkesin doğrulayabileceği tek bir işlemde yeniden oynatır.",
  },
  placeholder: {
    kicker: "Yeniden yapılıyor",
    body: "Bu sayfa Metropolis yenilemesinin parçası; bir sonraki aşamada geliyor.",
  },
  skipToContent: "İçeriğe geç",
  nav: {
    label: "Ana menü",
    console: "Konsol",
    wallet: "Param güvende mi?",
    guard: "Guard",
    how: "Nasıl çalışır",
    cta: "Stres testini çalıştır",
    menu: "Menü",
    closeMenu: "Menüyü kapat",
  },
  network: {
    name: "Monad testnet",
    block: "Blok",
    connecting: "Bağlanıyor",
    offline: "RPC'ye ulaşılamıyor",
    liveLabel: "Monad testnet'in son bloğu",
  },
  locale: {
    label: "Dil",
    switchTo: "English",
    switchToShort: "EN",
    current: "Türkçe",
  },
  badge: {
    winner: "Kazanan",
    event: "Monad Blitz İstanbul v2",
  },
  footer: {
    tagline: "Zincir üstü likidasyon kaskadı motoru. Tek işlem, tüm likidasyon dalgaları.",
    builtWith: "Kullanılanlar",
    tools: ["Monad testnet", "Aave verisi", "Envio HyperSync", "Alchemy", "Mera"],
    contracts: "Monad testnet'teki kontratlar",
    contractNames: {
      kaskad: "Kaskad motoru",
      kaskadMC: "KaskadMC (Monte Carlo)",
      guard: "KaskadGuard",
      marketA: "Piyasa A (korumasız)",
      marketB: "Piyasa B (Guard korumalı)",
    },
    snapshot: "Borçlu verisi",
    snapshotSource: "Monad mainnet Aave",
    snapshotBlock: "blok",
    source: "Kaynak kod",
    github: "GitHub",
    explorer: "MonadScan",
    externalHint: "yeni sekmede açılır",
  },
  common: {
    loading: "Yükleniyor",
    retry: "Tekrar dene",
    copy: "Kopyala",
    copied: "Kopyalandı",
  },
} satisfies CommonMessages;

export const commonMessages: Record<Locale, CommonMessages> = { en, tr };
