import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectChecks, fingerprint, MONITOR_END, MonitorError, needsEmail, parseState, sendEmail, type State } from "./lib/monitor.js";

const STATE_PATH = fileURLToPath(new URL("../.local/cloud-monitor.json", import.meta.url));
export async function runMonitor(args: string[], env: NodeJS.ProcessEnv = process.env) {
  if (args.some(a => !["--dry-run", "--send-test"].includes(a))) throw new MonitorError("Yalnızca --dry-run ve --send-test seçenekleri desteklenir.");
  const now = Date.now();
  if (now >= MONITOR_END) return { expired: true, emailSent: false };
  const dryRun = args.includes("--dry-run");
  const test = args.includes("--send-test");
  let previous: State | undefined;
  let stateError = false;
  try { previous = parseState(JSON.parse(await readFile(STATE_PATH, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") stateError = true; }
  const checks = await collectChecks({ key: env.NANSEN_API_KEY, previous, now });
  if (stateError) checks.push({ id: "monitor-state", level: "unknown", message: "Önceki izleme kaydı okunamadı; bildirim geçmişi yeniden başlatılacak." });
  const notify = needsEmail(checks, previous, test);
  if (!dryRun && (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO)) throw new MonitorError("E-posta gizli değişkenleri eksik; bulut takibi tamamlanmadı.");
  if (!dryRun && notify) await sendEmail({ checks, apiKey: env.RESEND_API_KEY, to: env.ALERT_EMAIL_TO, now, test,
    runUrl: env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined });
  if (!dryRun) {
    const state: State = { version: 1, measuredAt: new Date(now).toISOString(),
      balanceWei: checks.find(c => c.id === "sponsor")?.balanceWei,
      notifiedFingerprint: notify ? fingerprint(checks) : previous?.notifiedFingerprint ?? null,
      nansenPaused: checks.find(c => c.id === "nansen")?.pauseNansen ?? false };
    await mkdir(dirname(STATE_PATH), { recursive: true });
    await writeFile(STATE_PATH + ".tmp", JSON.stringify(state) + "\n", { mode: 0o600 });
    await rename(STATE_PATH + ".tmp", STATE_PATH);
  }
  return { measuredAt: new Date(now).toISOString(), checks, dryRun, emailSent: !dryRun && notify };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMonitor(process.argv.slice(2)).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
    console.error(error instanceof MonitorError ? error.message : "Bulut takibi tamamlanamadı; gizli hata ayrıntıları yazdırılmadı.");
    process.exitCode = 1;
  });
}
