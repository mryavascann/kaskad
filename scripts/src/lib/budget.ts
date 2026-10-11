import { formatEther, isAddress, parseEther, zeroAddress } from "viem";
import {
  SPONSOR_DAILY_GRANTS, SPONSOR_GRANT_WEI, SPONSOR_MIN_GRANT_WEI,
  SPONSOR_RESERVE_WEI, SPONSOR_TRANSFER_GAS,
} from "../../../web/lib/chain/api-policy.js";
import { MAX_FEE_PER_GAS } from "../../../web/lib/kaskad/tx.js";

export const DAY_MS = 86_400_000;
export const DEFAULT_SITE = "https://kaskad42.vercel.app";
export const DEFAULT_UNTIL = "2026-11-03";
export const MAX_TRANSFER_FEE = SPONSOR_TRANSFER_GAS * MAX_FEE_PER_GAS;
export class BudgetError extends Error {}

export type Status = {
  address: string;
  balanceWei: string;
  reserveWei: string;
  spendableWei: string;
};
export type Snapshot = Status & { site: string; measuredAt: string };
export type Observation = {
  from: string;
  to: string;
  elapsedHours: number;
  netBalanceChangeWei: string;
  netDecreasePerDayWei: string | null;
};
export type Report = {
  snapshot: Snapshot;
  untilInclusiveIstanbul: string;
  endExclusive: string;
  remainingDays: number;
  plannedDailyWei: string;
  transferFeeBufferWei: string;
  usableWei: string;
  requiredWei: string;
  topUpWei: string;
  affordableDailyWei: string;
  runwayDays: number | null;
  fundingAvailable: boolean;
  fullGrantsFromBalance: string;
  maxGrantWindowOutflowWei: string;
  assessment: "sufficient" | "top-up-needed";
  observation: Observation | null;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const wei = (value: unknown): value is string =>
  typeof value === "string" && /^(0|[1-9]\d{0,39})$/.test(value);
const maxZero = (value: bigint) => value > 0n ? value : 0n;
const ceilDiv = (value: bigint, divisor: bigint) => (value + divisor - 1n) / divisor;

/** Reject credentials/query strings so local history and errors never contain access tokens. */
export function siteOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new BudgetError("Site adresi geçersiz."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      (url.pathname !== "/" && url.pathname !== "")) {
    throw new BudgetError("Site için anahtarsız, HTTPS kök adresi kullanın.");
  }
  return url.origin;
}

export function dailyWei(value: string): bigint {
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,18})?$/.test(value)) {
    throw new BudgetError("Günlük MON bütçesi negatif olmayan, en fazla 18 ondalıklı bir sayı olmalı.");
  }
  return parseEther(value);
}

/** The named date is included in full, using the project's fixed UTC+03:00 planning timezone. */
export function horizonEnd(date: string): number {
  const midnight = Date.parse(date + "T00:00:00Z");
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(midnight) ||
      new Date(midnight).toISOString().slice(0, 10) !== date) {
    throw new BudgetError("Hedef tarih geçersiz; YYYY-MM-DD kullanın.");
  }
  return midnight + DAY_MS - 3 * 60 * 60 * 1_000;
}

export function parseStatus(value: unknown): Status {
  if (!record(value) || typeof value.address !== "string" ||
      !isAddress(value.address, { strict: false }) || value.address.toLowerCase() === zeroAddress ||
      !wei(value.balanceWei) || !wei(value.reserveWei) || !wei(value.spendableWei)) {
    throw new BudgetError("Sponsor durum yanıtı geçersiz.");
  }
  if (BigInt(value.reserveWei) !== SPONSOR_RESERVE_WEI ||
      BigInt(value.spendableWei) !== maxZero(BigInt(value.balanceWei) - BigInt(value.reserveWei))) {
    throw new BudgetError("Sponsor rezervi/bakiyesi yerel politikayla uyuşmuyor; aracı güncelleyin.");
  }
  return {
    address: value.address.toLowerCase(), balanceWei: value.balanceWei,
    reserveWei: value.reserveWei, spendableWei: value.spendableWei,
  };
}

export async function fetchStatus(site: string, fetcher: typeof fetch = fetch): Promise<Status> {
  const origin = siteOrigin(site);
  try {
    const response = await fetcher(origin + "/api/fund", {
      method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new BudgetError("Sponsor durum sorgusu başarısız (HTTP " + response.status + ").");
    if (!response.body) throw new BudgetError("Sponsor durum yanıtı boş.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4_096) {
        await reader.cancel();
        throw new BudgetError("Sponsor durum yanıtı beklenenden büyük.");
      }
      chunks.push(value);
    }
    return parseStatus(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof BudgetError) throw error;
    // Do not print a provider response, URL, redirect target or nested fetch exception.
    throw new BudgetError("Sponsor durumu okunamadı; bağlantıyı ve site erişimini kontrol edin.");
  }
}

export function parseHistory(value: unknown): Snapshot[] {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.snapshots) || value.snapshots.length > 1_000) {
    throw new BudgetError("Bütçe geçmişi geçersiz; mevcut dosya değiştirilmedi.");
  }
  return value.snapshots.map((sample: unknown) => {
    if (!record(sample) || typeof sample.site !== "string" || typeof sample.measuredAt !== "string" ||
        !Number.isFinite(Date.parse(sample.measuredAt)) ||
        new Date(sample.measuredAt).toISOString() !== sample.measuredAt) {
      throw new BudgetError("Bütçe geçmişindeki ölçüm geçersiz; mevcut dosya değiştirilmedi.");
    }
    return { ...parseStatus(sample), site: siteOrigin(sample.site), measuredAt: sample.measuredAt };
  });
}

export function observe(current: Snapshot, history: Snapshot[]): Observation | null {
  const now = Date.parse(current.measuredAt);
  // At least 24h of observations, no more than 7d: never annualize a few seconds of noise.
  const baseline = history.filter(sample =>
    sample.site === current.site && sample.address.toLowerCase() === current.address.toLowerCase() &&
    now - Date.parse(sample.measuredAt) >= DAY_MS && now - Date.parse(sample.measuredAt) <= 7 * DAY_MS,
  ).sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0];
  if (!baseline) return null;
  const elapsed = now - Date.parse(baseline.measuredAt);
  const change = BigInt(current.balanceWei) - BigInt(baseline.balanceWei);
  return {
    from: baseline.measuredAt, to: current.measuredAt, elapsedHours: elapsed / 3_600_000,
    netBalanceChangeWei: change.toString(),
    // A net increase is not negative spending; gross outflow cannot be inferred from balances.
    netDecreasePerDayWei: change > 0n ? null : ((-change * BigInt(DAY_MS)) / BigInt(elapsed)).toString(),
  };
}

export function budgetReport(snapshot: Snapshot, until: string, daily: bigint, history: Snapshot[] = []): Report {
  const now = Date.parse(snapshot.measuredAt);
  const end = horizonEnd(until);
  if (!Number.isFinite(now) || end <= now) throw new BudgetError("Hedef tarih ölçüm zamanından sonra olmalı.");
  if (daily < 0n) throw new BudgetError("Günlük bütçe negatif olamaz.");
  const remaining = end - now;
  const spendable = BigInt(snapshot.spendableWei);
  const usable = maxZero(spendable - MAX_TRANSFER_FEE);
  const required = ceilDiv(daily * BigInt(remaining), BigInt(DAY_MS));
  // A balance below the reserve must replenish that deficit too, before covering the plan.
  const topUp = maxZero(BigInt(snapshot.reserveWei) + required + MAX_TRANSFER_FEE - BigInt(snapshot.balanceWei));
  return {
    snapshot, untilInclusiveIstanbul: until, endExclusive: new Date(end).toISOString(),
    remainingDays: remaining / DAY_MS, plannedDailyWei: daily.toString(),
    transferFeeBufferWei: MAX_TRANSFER_FEE.toString(), usableWei: usable.toString(),
    requiredWei: required.toString(), topUpWei: topUp.toString(),
    affordableDailyWei: ((usable * BigInt(DAY_MS)) / BigInt(remaining)).toString(),
    runwayDays: daily === 0n ? null : Number(usable * 10_000n / daily) / 10_000,
    fundingAvailable: spendable >= SPONSOR_MIN_GRANT_WEI + MAX_TRANSFER_FEE,
    fullGrantsFromBalance: (spendable / (SPONSOR_GRANT_WEI + MAX_TRANSFER_FEE)).toString(),
    maxGrantWindowOutflowWei: (BigInt(SPONSOR_DAILY_GRANTS) * (SPONSOR_GRANT_WEI + MAX_TRANSFER_FEE)).toString(),
    assessment: topUp > 0n ? "top-up-needed" : "sufficient",
    observation: observe(snapshot, history),
  };
}

export function renderBudget(report: Report): string {
  const mon = (value: string) => formatEther(BigInt(value)) + " MON";
  const r = report;
  const observation = r.observation;
  return [
    "Kaskad sponsor bütçesi — salt okunur kontrol",
    "Site: " + r.snapshot.site,
    "Sponsor: " + r.snapshot.address,
    "Ölçüm: " + r.snapshot.measuredAt,
    "Bakiye: " + mon(r.snapshot.balanceWei),
    "Korunan rezerv: " + mon(r.snapshot.reserveWei),
    "Rezerv üzeri: " + mon(r.snapshot.spendableWei),
    "Son transfer için gas tamponu: " + mon(r.transferFeeBufferWei),
    "Planlamaya ayrılabilir: " + mon(r.usableWei),
    "En az 0,3 MON'luk yeni ödeme: " + (r.fundingAvailable ? "bakiye yeterli (diğer kotalar ayrıca uygulanır)" : "bakiye yetersiz"),
    "Bakiyenin karşıladığı 1 MON'luk tam ödemeler: " + r.fullGrantsFromBalance + " (gas dahil, kota hariç)",
    "",
    "Plan: " + mon(r.plannedDailyWei) + "/gün (gas dahil VARSAYIM; ölçülmüş harcama değil)",
    "Hedef: " + r.untilInclusiveIstanbul + " gün sonu, İstanbul (kalan " + r.remainingDays.toFixed(2) + " gün)",
    "Hedefe kadar planlanan tüketim: " + mon(r.requiredWei),
    "Gerekli ek bakiye: " + mon(r.topUpWei),
    "Bu bakiyeyle hedefe kadar günlük tavan: " + mon(r.affordableDailyWei),
    "Planlanan hızda dayanma süresi: " + (r.runwayDays === null ? "harcama varsayımı sıfır" : r.runwayDays.toFixed(2) + " gün"),
    "Sonuç: " + (r.assessment === "sufficient" ? "seçilen plan için yeterli" : "seçilen plan için ek MON gerekiyor"),
    "",
    "Günlük gözlem: " + (observation
      ? observation.elapsedHours.toFixed(1) + " saatte net bakiye değişimi " + mon(observation.netBalanceChangeWei) +
        (observation.netDecreasePerDayWei === null ? "; bakiye artmış, harcama çıkarılamaz."
          : "; günlük net azalış karşılığı " + mon(observation.netDecreasePerDayWei) + ".")
      : "henüz 24 saat–7 gün aralığında aynı sponsor/site ölçümü yok."),
    "Bakiye farkı gelen MON'u ve tüm giden tutarları birlikte içerir; gerçek günlük brüt harcamayı göstermez.",
    "Tahmin günlük planı kullanır; net bakiye farkını kullanmaz. Gelecekteki faucet/eklemeler sayılmaz.",
    "Plan parametreleri API ödeme kotalarını değiştirmez.",
    "API üst sınırı: " + mon(r.maxGrantWindowOutflowWei) + "/24 saatlik sayaç penceresi; bu bir harcama hedefi değildir.",
    "Otomatik takip kurulmadı. Ölçüm kaydetmek için komutu tekrar çalıştırın; işlem/ödeme gönderilmez.",
  ].join("\n");
}
