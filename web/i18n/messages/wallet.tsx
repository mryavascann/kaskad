/**
 * Copy of /wallet and /tr/cuzdan ("Is my position safe?"). Shocks, thresholds and amounts are
 * parameters: they come from lib/chain/wallet.ts constants, the position (/api/position) and free
 * cascade previews.
 */
import type { ReactNode } from "react";
import type { HealthDialCopy } from "@/viz/health-dial";
import type { Locale } from "../config";

type S = string;
const strong = (s: S, tone = "text-liq-hi") => <b className={`font-mono font-medium ${tone}`}>{s}</b>;

const en = {
  meta: {
    title: "Is my position safe?",
    description: "Check how an Aave position on Monad holds up in the next liquidation cascade. Read only.",
  },
  hero: {
    kicker: "Wallet risk",
    title: "Is my position safe?",
    lead: "See how an Aave position on Monad holds up in the next shock: where it becomes liquidatable, what the cascade does to it, and what it would take to stay safe. Read only: nothing is signed.",
  },
  search: {
    title: "Check a position",
    readOnly: "Read only",
    label: "Monad mainnet address",
    placeholder: "0x… Monad mainnet address",
    hint: "Positions are read from Aave on Monad mainnet. Nothing is signed or sent.",
    check: "Check",
    mera: "Use my Mera passkey",
    injected: "Use my browser wallet",
    samples: "Examples",
    sampleLabels: {
      "largest-syrupusdc-borrower": "Largest syrupUSDC borrower",
      "largest-pt-ausd-borrower": "Largest PT-AUSD borrower",
    } as Record<string, S>,
    errors: {
      "invalid-address": "That is not a valid address.",
      "rate-limited": "Too many lookups. Wait a minute and try again.",
      unconfigured: "Position lookup is not configured on this deployment.",
      upstream: "Monad mainnet did not answer. Try again.",
      failed: "The lookup failed.",
    } as Record<string, S>,
    identityErrors: {
      "no-wallet": "No browser wallet found.",
      rejected: "The request was rejected.",
      failed: "Could not read the address.",
    } as Record<string, S>,
  },
  empty: [
    ["Your liquidation threshold", "At which price drop does the position become liquidatable?"],
    ["The cascade's effect", "What do the chained sales do to your debt?"],
    ["Your deposits", "How much of the pool can still be withdrawn?"],
  ] as [S, S][],
  borrow: {
    title: "Borrow side",
    meta: (v: { address: S; block: S; emode: S }) => `${v.address} · block ${v.block} · E-Mode ${v.emode}`,
    emodeNone: "none",
    noDebt: "No debt: no liquidation risk.",
    collateral: "Collateral",
    debt: "Debt",
    liquidatableNow: "You can be liquidated right now.",
    never: (v: { asset: S }) => `Even if ${v.asset} went to zero, your other collateral would cover the debt.`,
    atDrop: (v: { asset: S; drop: S }) => (<>You get liquidated if {v.asset} drops {strong(v.drop)}.</>) as ReactNode,
    thresholdNote: (v: { asset: S; supplied: S; lt: S }) =>
      `Dominant collateral: ${v.asset} (${v.supplied}, liquidation threshold ${v.lt}). Other collateral is kept at a fixed price.`,
  },
  cascade: {
    title: "What the cascade does to you",
    body: (v: { asset: S; shock: S; drop: S; stuck: S; bad: S }) =>
      (
        <>
          Kaskad scenario ({v.asset} {v.shock}, real book): the price falls {strong(v.drop, "text-fg-1")}. Across the protocol,{" "}
          {strong(v.stuck, "text-warn")} can&apos;t be liquidated instantly and {strong(v.bad)} ends as bad debt.
        </>
      ) as ReactNode,
    liquidated: "In this scenario your position is liquidated.",
    survives: "In this scenario your position survives.",
    open: "Open the console",
  },
  protect: {
    /** Asset symbols keep their case inside the uppercase mono label (syrupUSDC, not SYRUPUSDC). */
    title: (v: { asset: S; target: S }) => (<>Stay safe · <span className="normal-case">{v.asset}</span> · HF ≥ {v.target}</>) as ReactNode,
    slider: "Price drop to survive",
    addCollateral: (v: { asset: S }) => `add ${v.asset} collateral`,
    repay: "or repay this much debt",
  },
  supply: {
    title: "Deposit side",
    none: "No deposits.",
    columns: { asset: "Asset", supplied: "Supplied", utilization: "Pool utilization", withdraw: "Withdrawal" },
    atRisk: (v: { liquidity: S }) => `at risk: ~${v.liquidity} liquid`,
    withdrawable: "withdrawable",
    collateralOnly: "collateral (not lent out)",
    loss: "Approximate loss on my deposits",
    lossBody: (v: { asset: S; shock: S; bad: S; share: S }) =>
      (
        <>
          In the {v.asset} {v.shock} cascade, {strong(v.bad)} of debt ends as bad debt across the protocol. Your lent deposits&apos;
          share of it: about {strong(v.share)}.
        </>
      ) as ReactNode,
    lossNote: "Approximation: bad debt is spread over lent pools by deposit share (on Aave, Umbrella and the reserves absorb it first).",
    withdrawHow: "How is the withdrawal risk computed?",
    withdrawBody:
      "When utilization nears 100%, the pool has no cash left to withdraw. During a cascade borrowers don't repay, so depositors wait in line.",
  },
  dial: {
    label: "Health factor",
    liquidatable: "Liquidatable",
    warning: "Warning",
    safe: "Safe",
    noDebt: "No debt",
    loading: "Loading the health factor",
    zones: "Liquidatable under {one}, warning under {target}.",
  } satisfies HealthDialCopy,
};

export type WalletMessages = typeof en;

const tr = {
  meta: {
    title: "Param güvende mi?",
    description: "Monad'daki bir Aave pozisyonunun bir sonraki likidasyon kaskadına ne kadar dayanacağını gör. Salt okunur.",
  },
  hero: {
    kicker: "Cüzdan riski",
    title: "Param güvende mi?",
    lead: "Monad'daki bir Aave pozisyonunun bir sonraki şoka dayanıklılığını gör: nerede likide edilebilir hale geldiğini, kaskadın ona ne yaptığını ve güvende kalmak için ne gerektiğini. Salt okunur: hiçbir şey imzalanmaz.",
  },
  search: {
    title: "Bir pozisyonu kontrol et",
    readOnly: "Salt okunur",
    label: "Monad mainnet adresi",
    placeholder: "0x… Monad mainnet adresi",
    hint: "Pozisyonlar Monad mainnet'teki Aave'den okunur. Hiçbir şey imzalanmaz ya da gönderilmez.",
    check: "Kontrol et",
    mera: "Mera passkey'imle",
    injected: "Tarayıcı cüzdanımla",
    samples: "Örnekler",
    sampleLabels: {
      "largest-syrupusdc-borrower": "En büyük syrupUSDC borçlusu",
      "largest-pt-ausd-borrower": "En büyük PT-AUSD borçlusu",
    } as Record<string, S>,
    errors: {
      "invalid-address": "Bu geçerli bir adres değil.",
      "rate-limited": "Çok fazla sorgu. Bir dakika bekleyip tekrar dene.",
      unconfigured: "Bu kurulumda pozisyon sorgusu ayarlı değil.",
      upstream: "Monad mainnet cevap vermedi. Tekrar dene.",
      failed: "Sorgu başarısız.",
    } as Record<string, S>,
    identityErrors: {
      "no-wallet": "Tarayıcı cüzdanı bulunamadı.",
      rejected: "İstek reddedildi.",
      failed: "Adres okunamadı.",
    } as Record<string, S>,
  },
  empty: [
    ["Likidasyon eşiğin", "Pozisyonun hangi fiyat düşüşünde likide edilebilir hale geliyor?"],
    ["Kaskad etkisi", "Zincirleme satışlar borcunu nasıl etkiliyor?"],
    ["Mevduatın", "Havuzdan hâlâ ne kadarı çekilebilir?"],
  ] as [S, S][],
  borrow: {
    title: "Borç tarafı",
    meta: (v: { address: S; block: S; emode: S }) => `${v.address} · blok ${v.block} · E-Mode ${v.emode}`,
    emodeNone: "yok",
    noDebt: "Borcun yok: likidasyon riski yok.",
    collateral: "Teminat",
    debt: "Borç",
    liquidatableNow: "Şu an likide edilebilirsin.",
    never: (v: { asset: S }) => `${v.asset} sıfıra düşse bile diğer teminatın borcu karşılıyor.`,
    atDrop: (v: { asset: S; drop: S }) => (<>{v.asset} {strong(v.drop)} düşerse likide olursun.</>) as ReactNode,
    thresholdNote: (v: { asset: S; supplied: S; lt: S }) =>
      `Baskın teminat: ${v.asset} (${v.supplied}, likidasyon eşiği ${v.lt}). Diğer teminatlar sabit fiyatlı sayılır.`,
  },
  cascade: {
    title: "Kaskad sana ne yapar",
    body: (v: { asset: S; shock: S; drop: S; stuck: S; bad: S }) =>
      (
        <>
          Kaskad senaryosu ({v.asset} {v.shock}, gerçek defter): fiyat {strong(v.drop, "text-fg-1")} düşüyor. Protokol genelinde{" "}
          {strong(v.stuck, "text-warn")} borç anında likide edilemiyor, {strong(v.bad)} karşılıksız kalıyor.
        </>
      ) as ReactNode,
    liquidated: "Bu senaryoda pozisyonun likide olur.",
    survives: "Bu senaryoda pozisyonun ayakta kalır.",
    open: "Konsolu aç",
  },
  protect: {
    title: (v: { asset: S; target: S }) => (<>Güvende kal · <span className="normal-case">{v.asset}</span> · HF ≥ {v.target}</>) as ReactNode,
    slider: "Dayanılacak fiyat düşüşü",
    addCollateral: (v: { asset: S }) => `${v.asset} teminat ekle`,
    repay: "ya da bu kadar borç öde",
  },
  supply: {
    title: "Mevduat tarafı",
    none: "Yatırdığın varlık yok.",
    columns: { asset: "Varlık", supplied: "Yatırılan", utilization: "Havuz kullanım oranı", withdraw: "Çekim" },
    atRisk: (v: { liquidity: S }) => `riskli: likidite ~${v.liquidity}`,
    withdrawable: "çekilebilir",
    collateralOnly: "teminat (borç verilmiyor)",
    loss: "Mevduatıma düşen yaklaşık zarar",
    lossBody: (v: { asset: S; shock: S; bad: S; share: S }) =>
      (
        <>
          {v.asset} {v.shock} kaskadında protokol genelinde {strong(v.bad)} borç karşılıksız kalıyor. Borç verilen mevduatlarının
          payına düşen: yaklaşık {strong(v.share)}.
        </>
      ) as ReactNode,
    lossNote: "Yaklaşım: karşılıksız borç, borç verilen havuzlara mevduat payıyla dağıtılır (Aave'de önce Umbrella ve rezervler karşılar).",
    withdrawHow: "Çekim riski nasıl hesaplandı?",
    withdrawBody:
      "Kullanım oranı %100'e yaklaşırsa havuzda çekilecek nakit kalmaz. Kaskad sırasında borçlular geri ödemediği için mevduat sahipleri sıraya girer.",
  },
  dial: {
    label: "Sağlık faktörü",
    liquidatable: "Likide edilebilir",
    warning: "Uyarı",
    safe: "Güvende",
    noDebt: "Borç yok",
    loading: "Sağlık faktörü yükleniyor",
    zones: "{one} altında likide edilebilir, {target} altında uyarı.",
  } satisfies HealthDialCopy,
} satisfies WalletMessages;

export const walletMessages: Record<Locale, WalletMessages> = { en, tr };
