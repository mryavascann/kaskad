import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { formatEther, parseEther } from "viem";
import { budgetReport, DEFAULT_SITE, fetchStatus, horizonEnd } from "./monitor-budget";

export const MONITOR_END = horizonEnd("2026-11-03");
export const PAGE_PATHS = ["/tr", "/tr/app", "/tr/cuzdan", "/tr/perps"];
type Level = "ok" | "warning" | "critical" | "unknown";
export type Check = { id: string; level: Level; message: string; balanceWei?: string; credits?: number; pauseNansen?: boolean };
export type State = {
  version: 1; measuredAt: string; balanceWei?: string;
  notifiedFingerprint: string | null; nansenPaused?: boolean;
};
type Context = { fetcher: typeof fetch; pause: (ms: number) => Promise<unknown>; now: number };
export class MonitorError extends Error {}

export function parseState(input: unknown): State {
  const s = input as Partial<State> | null;
  if (!s || s.version !== 1 || typeof s.measuredAt !== "string" || !Number.isFinite(Date.parse(s.measuredAt)) ||
    !(s.notifiedFingerprint === null || (typeof s.notifiedFingerprint === "string" && /^[a-f0-9]{64}$/.test(s.notifiedFingerprint))) ||
    !(s.balanceWei === undefined || (typeof s.balanceWei === "string" && /^\d{1,40}$/.test(s.balanceWei))) ||
    !(s.nansenPaused === undefined || typeof s.nansenPaused === "boolean")) {
    throw new MonitorError("Önceki izleme kaydı geçersiz; bildirim durumu korunamadı.");
  }
  return { version: 1, measuredAt: s.measuredAt, notifiedFingerprint: s.notifiedFingerprint, balanceWei: s.balanceWei, nansenPaused: s.nansenPaused };
}

async function body(response: Response, limit: number): Promise<string> {
  if (!response.body) throw new Error("empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("oversize"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function retry(probe: () => Promise<Check>, ctx: Context): Promise<Check> {
  const first = await probe();
  if (first.level !== "unknown") return first;
  await ctx.pause(30_000);
  return probe();
}

async function page(path: string, ctx: Context): Promise<Check> {
  try {
    const response = await ctx.fetcher(DEFAULT_SITE + path, { redirect: "error", signal: AbortSignal.timeout(25_000) });
    if (response.status !== 200) return { id: path, level: "unknown", message: `${path}: HTTP ${response.status}.` };
    const html = await body(response, 2_000_000);
    if (!/<title>[^<]*kaskad/i.test(html)) return { id: path, level: "unknown", message: `${path}: beklenen Kaskad sayfası alınamadı.` };
    return { id: path, level: "ok", message: `${path}: HTTP 200, Kaskad sayfası erişilebilir.` };
  } catch { return { id: path, level: "unknown", message: `${path}: erişim doğrulanamadı.` }; }
}

async function sponsor(ctx: Context, previous?: State): Promise<Check> {
  try {
    const status = await fetchStatus(DEFAULT_SITE, ctx.fetcher);
    const report = budgetReport({ ...status, site: DEFAULT_SITE, measuredAt: new Date(ctx.now).toISOString() }, "2026-11-03", 0n);
    const usable = BigInt(report.usableWei);
    const dropped = previous?.balanceWei !== undefined && ctx.now - Date.parse(previous.measuredAt) <= 24 * 3_600_000 &&
      BigInt(previous.balanceWei) - BigInt(status.balanceWei) >= parseEther("1");
    const level = !report.fundingAvailable || usable < parseEther("1") ? "critical" : usable < parseEther("2") || dropped ? "warning" : "ok";
    return { id: "sponsor", level, balanceWei: status.balanceWei,
      message: `Sponsor bakiyesi ${formatEther(BigInt(status.balanceWei))} MON; rezerv ve gas sonrası ${formatEther(usable)} MON kullanılabilir.` +
        (!report.fundingAvailable ? " En küçük sponsor ödemesi için bakiye yetersiz." : "") +
        (dropped ? " Önceki ölçümden beri en az 1 MON net azalma var." : "") };
  } catch { return { id: "sponsor", level: "unknown", message: "Sponsor bakiyesi okunamadı; fonlama durumu doğrulanamadı." }; }
}

async function nansen(key: string | undefined, ctx: Context): Promise<Check> {
  if (!key) return { id: "nansen", level: "critical", message: "Nansen izleme anahtarı eksik; kredi bakiyesi bilinmiyor." };
  try {
    // Fixed destination and no redirects: never forward this credential elsewhere.
    const response = await ctx.fetcher("https://api.nansen.ai/api/v1/account", {
      headers: { apikey: key }, redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if ([401, 402, 403].includes(response.status)) return { id: "nansen", level: "critical", message: `Nansen hesap sorgusu HTTP ${response.status}; erişim/kredi durumu incelenmeli.` };
    if (response.status !== 200) return { id: "nansen", level: "unknown", message: `Nansen hesap sorgusu HTTP ${response.status}; bakiye bilinmiyor.` };
    const data = JSON.parse(await body(response, 4_096));
    const credits: unknown = data?.credits_remaining;
    if (typeof credits !== "number" || !Number.isFinite(credits) || credits < 0) throw new Error("invalid credits");
    if (response.headers.get("x-nansen-credits-used") !== "0" || response.headers.get("x-nansen-credits-cost") !== "0") {
      return { id: "nansen", level: "critical", credits, pauseNansen: true, message: "Nansen hesap sorgusunun sıfır maliyeti doğrulanamadı; otomatik Nansen sorguları durduruldu." };
    }
    return { id: "nansen", level: credits === 0 ? "critical" : credits < 100 ? "warning" : "ok", credits,
      message: `Nansen: ${credits} kredi; bu kontrolün maliyeti 0 kredi.` + (credits < 100 ? " Yeni standart etiket sorgusu için gereken 100 kredinin altında." : "") };
  } catch { return { id: "nansen", level: "unknown", message: "Nansen kredi bakiyesi okunamadı; mevcut bakiye bilinmiyor." }; }
}

export async function collectChecks(options: { key?: string; previous?: State; now?: number; fetcher?: typeof fetch; pause?: Context["pause"] }): Promise<Check[]> {
  const ctx = { now: options.now ?? Date.now(), fetcher: options.fetcher ?? fetch, pause: options.pause ?? delay };
  if (ctx.now >= MONITOR_END) return [];
  return Promise.all([
    ...PAGE_PATHS.map(path => retry(() => page(path, ctx), ctx)),
    retry(() => sponsor(ctx, options.previous), ctx),
    options.previous?.nansenPaused
      ? Promise.resolve({ id: "nansen", level: "critical" as const, pauseNansen: true, message: "Nansen sorguları maliyet belirsizliği nedeniyle durduruldu; yapılandırma incelenmeli." })
      : retry(() => nansen(options.key, ctx), ctx),
  ]);
}

export function fingerprint(checks: Check[]): string {
  return createHash("sha256").update(JSON.stringify(checks.map(c => [c.id, c.level]).sort())).digest("hex");
}

export function needsEmail(checks: Check[], previous?: State, test = false): boolean {
  if (test) return true;
  if (previous?.notifiedFingerprint) return previous.notifiedFingerprint !== fingerprint(checks);
  return checks.some(check => check.level !== "ok");
}

export async function sendEmail(options: {
  checks: Check[]; to?: string; apiKey?: string; now: number; test?: boolean; runUrl?: string; fetcher?: typeof fetch;
}) {
  if (!options.apiKey || !options.to || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(options.to)) {
    throw new MonitorError("E-posta gönderim anahtarı veya alıcı yapılandırılmamış.");
  }
  const problem = options.checks.some(c => c.level !== "ok");
  const title = options.test ? "Kaskad bulut takibi: test bildirimi" : problem ? "Kaskad: kontrol gerekiyor" : "Kaskad: kontroller normale döndü";
  const text = [title, new Date(options.now).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) + " İstanbul", "",
    ...options.checks.map(c => `${c.level.toUpperCase()}: ${c.message}`), "",
    "Kontroller salt okunurdur; MON aktarımı veya kredi satın alımı yapılmaz.",
    "Düşük sponsor bakiyesinde testnet fonlamasını; düşük Nansen kredisinde API kredi hesabını kontrol edin.",
    "Site kontrolü HTTP erişimini ölçer; tüm kullanıcı işlemlerini denemez.",
    options.runUrl && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(options.runUrl) ? options.runUrl : "",
  ].filter(Boolean).join("\n");
  try {
    const response = await (options.fetcher ?? fetch)("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256").update(`${options.test ? "test" : "alert"}:${fingerprint(options.checks)}:${options.runUrl ?? options.now}`).digest("hex") },
      body: JSON.stringify({ from: "Kaskad <onboarding@resend.dev>", to: [options.to], subject: title, text }),
    });
    if (!response.ok) throw new Error("send failed");
    const data = JSON.parse(await body(response, 4_096));
    if (typeof data?.id !== "string" || !data.id) throw new Error("missing receipt");
  } catch { throw new MonitorError("Uyarı e-postası gönderilemedi; Resend yapılandırmasını kontrol edin. Bildirim başarılı sayılmadı."); }
}
