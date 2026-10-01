/**
 * Copy of /guard and /tr/guard. Every threshold, ratio and amount is a parameter: the page reads them
 * from the Guard contract, the markets and the engine preview.
 */
import type { ReactNode } from "react";
import type { Locale } from "../config";

type S = string;
const accent = (s: string) => <em className="font-serif font-normal tracking-[-0.02em] text-fg-2">{s}</em>;

const en = {
  meta: {
    title: "Guard",
    description: "KaskadGuard: an on-chain circuit breaker that runs the cascade and pauses borrowing when bad debt crosses its threshold.",
  },
  hero: {
    kicker: "Guard",
    title: (<>A circuit breaker that {accent("reads")} the cascade.</>) as ReactNode,
    lead: "KaskadGuard runs a stored stress scenario on the Kaskad engine, on chain. When the simulated bad debt crosses its threshold, it pauses borrowing on the market it protects and lowers the maximum LTV. Anyone can trigger it, and the rule is public.",
  },
  rule: {
    title: "The rule, read from the Guard",
    scenario: "Scenario",
    scenarioValue: (v: { asset: S; shock: S; oracle: S; positions: S }) => `${v.asset} ${v.shock}, ${v.oracle}, real book (${v.positions} positions)`,
    oracle: { external: "external price", pool: "oracle follows the pool (worst case)" },
    trips: "Trips when",
    tripsValue: (v: { bad: S }) => `bad debt > ${v.bad} of the simulated debt`,
    tripsLiq: (v: { liq: S }) => `or liquidated > ${v.liq}`,
    effect: "Then",
    effectValue: (v: { ltv: S }) => `borrowing paused on market B, maximum LTV lowered to ${v.ltv}`,
    now: "Right now",
    nowTrip: (v: { ratio: S }) => `the scenario's bad debt is ${v.ratio} of the debt: refresh() would pause market B`,
    nowSafe: (v: { ratio: S }) => `the scenario's bad debt is ${v.ratio} of the debt: below the threshold`,
    contracts: "Contracts",
    guard: "Guard",
    engine: "Engine",
    loading: "Reading the Guard",
    error: "The Guard could not be read from the RPC right now.",
  },
  markets: {
    title: "Two markets, one protected",
    a: { name: "Market A", role: "Unprotected" },
    b: { name: "Market B", role: "Protected by KaskadGuard" },
    paused: "Borrows paused",
    open: "Borrows open",
    maxLtv: "Max LTV",
    borrowed: "Borrowed",
    units: "units",
    breakerNone: "No circuit breaker",
    breakerArmed: "Breaker armed",
    breakerTripped: "Breaker tripped",
    tryBorrow: (v: { amount: S }) => `Try to borrow ${v.amount} units`,
    borrowedOk: "Borrowed: market A has nothing to stop it.",
    pausedExplain: "The Guard paused this market. The call was checked with a free eth_call first, so nothing was spent.",
    revertCall: (v: { amount: S }) => `eth_call borrow(${v.amount})`,
    revertLine: "revert BorrowIsPaused()",
  },
  run: {
    title: "Run the Guard yourself",
    body: "refresh() is public. It re-runs the stored scenario on the engine inside the same transaction and applies the rule.",
    cta: "Run the Guard",
    tripped: (v: { ratio: S }) => `Checked: bad debt at ${v.ratio} of the debt. Market B stays paused.`,
    safe: (v: { ratio: S }) => `Checked: bad debt at ${v.ratio}, below the threshold. Nothing changed.`,
  },
  how: {
    title: "How it works",
    steps: [
      ["Anyone calls refresh()", "No keeper, no oracle committee: the Guard is a public function."],
      ["The engine runs the scenario", "In the same transaction the Guard calls Kaskad with its stored scenario and gets the cascade result."],
      ["The rule is applied", "Bad debt (and optionally liquidated debt) divided by the simulated debt is compared with the thresholds."],
      ["The market reacts", "Above the threshold the Guard pauses borrowing on market B and lowers its maximum LTV. GuardChecked and GuardTripped are emitted."],
    ] as [string, string][],
    compose: "Any lending protocol can do the same: read Kaskad's result on chain and act on it in the same block.",
  },
  proof: {
    title: "On-chain proof",
    body: (v: { date: S; ratio: S }) => `On ${v.date}, refresh() read a bad-debt ratio of ${v.ratio} and paused borrowing on market B.`,
    missing: "The proof transaction could not be read from the RPC right now.",
    open: "Open on MonadScan",
  },
};

export type GuardMessages = typeof en;

const tr = {
  meta: {
    title: "Guard",
    description: "KaskadGuard: kaskadı çalıştıran ve karşılıksız borç eşiği aşılınca borç vermeyi durduran zincir üstü devre kesici.",
  },
  hero: {
    kicker: "Guard",
    title: (<>Kaskadı {accent("okuyan")} bir devre kesici.</>) as ReactNode,
    lead: "KaskadGuard, kayıtlı bir stres senaryosunu Kaskad motorunda, zincirde çalıştırır. Simüle edilen karşılıksız borç eşiği aşınca koruduğu piyasada borç vermeyi durdurur ve maksimum LTV'yi düşürür. Herkes tetikleyebilir; kural herkese açıktır.",
  },
  rule: {
    title: "Kural, Guard'dan okunuyor",
    scenario: "Senaryo",
    scenarioValue: (v: { asset: S; shock: S; oracle: S; positions: S }) => `${v.asset} ${v.shock}, ${v.oracle}, gerçek defter (${v.positions} pozisyon)`,
    oracle: { external: "dış fiyat", pool: "oracle havuzu izler (en kötü durum)" },
    trips: "Tetiklenir",
    tripsValue: (v: { bad: S }) => `karşılıksız borcun simüle edilen borca oranı ${v.bad} üstündeyse`,
    tripsLiq: (v: { liq: S }) => `ya da likide edilen oran ${v.liq} üstündeyse`,
    effect: "Sonra",
    effectValue: (v: { ltv: S }) => `B piyasasında borç durur, maksimum LTV ${v.ltv} seviyesine iner`,
    now: "Şu an",
    nowTrip: (v: { ratio: S }) => `senaryonun karşılıksız borç oranı ${v.ratio}: refresh() B piyasasını durdurur`,
    nowSafe: (v: { ratio: S }) => `senaryonun karşılıksız borç oranı ${v.ratio}: eşiğin altında`,
    contracts: "Kontratlar",
    guard: "Guard",
    engine: "Motor",
    loading: "Guard okunuyor",
    error: "Guard şu an RPC'den okunamadı.",
  },
  markets: {
    title: "İki piyasa, biri korumalı",
    a: { name: "Piyasa A", role: "Korumasız" },
    b: { name: "Piyasa B", role: "KaskadGuard korumalı" },
    paused: "Borç durduruldu",
    open: "Borç açık",
    maxLtv: "Maks. LTV",
    borrowed: "Verilen borç",
    units: "birim",
    breakerNone: "Devre kesici yok",
    breakerArmed: "Devre kesici hazır",
    breakerTripped: "Devre kesici attı",
    tryBorrow: (v: { amount: S }) => `${v.amount} birim borç almayı dene`,
    borrowedOk: "Borç verildi: A piyasasını durduracak bir şey yok.",
    pausedExplain: "Guard bu piyasayı durdurdu. Çağrı önce ücretsiz bir eth_call ile kontrol edildi; hiçbir şey harcanmadı.",
    revertCall: (v: { amount: S }) => `eth_call borrow(${v.amount})`,
    revertLine: "revert BorrowIsPaused()",
  },
  run: {
    title: "Guard'ı kendin çalıştır",
    body: "refresh() herkese açık. Kayıtlı senaryoyu aynı işlem içinde motorda yeniden çalıştırır ve kuralı uygular.",
    cta: "Guard'ı çalıştır",
    tripped: (v: { ratio: S }) => `Kontrol edildi: karşılıksız borç oranı ${v.ratio}. B piyasası durdurulmuş kalıyor.`,
    safe: (v: { ratio: S }) => `Kontrol edildi: karşılıksız borç oranı ${v.ratio}, eşiğin altında. Hiçbir şey değişmedi.`,
  },
  how: {
    title: "Nasıl çalışır",
    steps: [
      ["Herkes refresh() çağırabilir", "Keeper yok, oracle komitesi yok: Guard herkese açık bir fonksiyon."],
      ["Motor senaryoyu çalıştırır", "Aynı işlemde Guard, kayıtlı senaryosuyla Kaskad'ı çağırır ve kaskad sonucunu alır."],
      ["Kural uygulanır", "Karşılıksız borcun (istenirse likide edilen borcun) simüle edilen borca oranı eşiklerle karşılaştırılır."],
      ["Piyasa tepki verir", "Eşik aşılırsa Guard, B piyasasında borç vermeyi durdurur ve maksimum LTV'yi düşürür. GuardChecked ve GuardTripped yayınlanır."],
    ] as [string, string][],
    compose: "Her borç protokolü aynısını yapabilir: Kaskad'ın sonucunu zincirden okuyup aynı blokta harekete geçer.",
  },
  proof: {
    title: "Zincirdeki kanıt",
    body: (v: { date: S; ratio: S }) => `${v.date} tarihinde refresh(), karşılıksız borç oranını ${v.ratio} okudu ve B piyasasında borç vermeyi durdurdu.`,
    missing: "Kanıt işlemi şu an RPC'den okunamadı.",
    open: "MonadScan'de aç",
  },
} satisfies GuardMessages;

export const guardMessages: Record<Locale, GuardMessages> = { en, tr };
