import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BudgetError, DEFAULT_SITE, DEFAULT_UNTIL, DAY_MS, budgetReport, dailyWei, fetchStatus,
  horizonEnd, parseHistory, renderBudget, siteOrigin, type Snapshot,
} from "./lib/budget.js";

const DEFAULT_STATE = fileURLToPath(new URL("../.local/sponsor-budget.json", import.meta.url));
const HELP = [
  "Kaskad sponsor bütçesi (özel anahtar gerekmez, yalnızca GET /api/fund)",
  "npm --prefix scripts run budget -- [seçenekler]",
  "  --site HTTPS_URL       Varsayılan: " + DEFAULT_SITE,
  "  --until YYYY-MM-DD     Dahil edilen son İstanbul günü: " + DEFAULT_UNTIL,
  "  --daily-mon MON        Gas dahil günlük plan; varsayılan 1 MON (varsayım)",
  "  --state DOSYA          Yerel ölçüm geçmişi; varsayılan scripts/.local/sponsor-budget.json",
  "  --json                 Makine tarafından okunabilir rapor",
  "  --check                Plan yetersizse çıkış kodu 2 (hata 1, yeterli 0)",
  "  --help                 Yardım",
  "Bu komut arka planda çalışmaz, zamanlama kurmaz ve MON göndermez.",
].join("\n");

export function parseOptions(args: string[]) {
  const options = { site: DEFAULT_SITE, until: DEFAULT_UNTIL, daily: dailyWei("1"), state: DEFAULT_STATE, json: false, check: false, help: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new BudgetError("Aynı seçenek birden fazla verilemez.");
    seen.add(flag);
    if (flag === "--help") { options.help = true; continue; }
    if (flag === "--json") { options.json = true; continue; }
    if (flag === "--check") { options.check = true; continue; }
    if (!["--site", "--until", "--daily-mon", "--state"].includes(flag)) throw new BudgetError("Bilinmeyen seçenek; --help kullanın.");
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new BudgetError("Seçenek değeri eksik; --help kullanın.");
    if (flag === "--site") options.site = siteOrigin(value);
    if (flag === "--until") { horizonEnd(value); options.until = value; }
    if (flag === "--daily-mon") options.daily = dailyWei(value);
    if (flag === "--state") options.state = resolve(value);
  }
  return options;
}

async function historyAt(path: string): Promise<Snapshot[]> {
  try {
    if ((await stat(path)).size > 512_000) throw new BudgetError("Geçmiş dosyası beklenenden büyük; değiştirilmedi.");
    return parseHistory(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof BudgetError) throw error;
    throw new BudgetError("Geçmiş dosyası okunamadı; değiştirilmedi.");
  }
}

/** Public API only; intentionally does not import env.ts or load any signing credentials. */
export async function runBudget(args: string[], fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  const options = parseOptions(args);
  if (options.help) return { output: HELP, exitCode: 0 };
  if (horizonEnd(options.until) <= now()) throw new BudgetError("Hedef tarih geçmişte; --until ile yeni tarih seçin.");
  const status = await fetchStatus(options.site, fetcher);
  const measuredAt = now();
  const snapshot: Snapshot = { ...status, site: options.site, measuredAt: new Date(measuredAt).toISOString() };
  await mkdir(dirname(options.state), { recursive: true });
  const lockPath = options.state + ".lock";
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch { throw new BudgetError("Geçmiş kilitlenemedi; başka kontrol çalışıyor olabilir veya klasör yazılamıyor."); }
  const tempPath = options.state + "." + randomUUID() + ".tmp";
  try {
    const history = await historyAt(options.state);
    if (history.some(sample => Date.parse(sample.measuredAt) > measuredAt)) {
      throw new BudgetError("Geçmişte geleceğe ait ölçüm var; sistem saatini kontrol edin. Dosya değiştirilmedi.");
    }
    const report = budgetReport(snapshot, options.until, options.daily, history);
    const snapshots = history.filter(sample => measuredAt - Date.parse(sample.measuredAt) <= 90 * DAY_MS)
      .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt)).slice(-999);
    snapshots.push(snapshot);
    const file = await open(tempPath, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify({ version: 1, snapshots }, null, 2) + "\n");
    } finally { await file.close(); }
    await rename(tempPath, options.state);
    return {
      output: options.json ? JSON.stringify(report, null, 2) : renderBudget(report),
      exitCode: options.check && report.assessment === "top-up-needed" ? 2 : 0,
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBudget(process.argv.slice(2)).then(result => {
    console.log(result.output);
    process.exitCode = result.exitCode;
  }).catch(error => {
    console.error(error instanceof BudgetError ? error.message : "Bütçe kontrolü tamamlanamadı; ağ/dosya erişimini kontrol edin.");
    process.exitCode = 1;
  });
}
