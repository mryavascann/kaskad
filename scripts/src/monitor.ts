import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectChecks, fingerprint, MONITOR_END, MonitorError, needsEmail, parseState, sendEmail, type State } from "./lib/monitor.js";

const STATE_PATH = fileURLToPath(new URL("../.local/cloud-monitor.json", import.meta.url));
export async function runMonitor(args: string[], env: NodeJS.ProcessEnv = process.env, deps: {
  now?: () => number; statePath?: string; fetcher?: typeof fetch; pause?: (ms: number) => Promise<unknown>;
} = {}) {
  if (args.some(a => !["--dry-run", "--send-test"].includes(a))) throw new MonitorError("Yalnızca --dry-run ve --send-test seçenekleri desteklenir.");
  const now = (deps.now ?? Date.now)();
  const statePath = deps.statePath ?? STATE_PATH;
  if (now >= MONITOR_END) return { expired: true, emailSent: false };
  const dryRun = args.includes("--dry-run");
  const test = args.includes("--send-test");
  let previous: State | undefined;
  let stateError = false;
  try { previous = parseState(JSON.parse(await readFile(statePath, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") stateError = true; }
  const checks = await collectChecks({ key: env.NANSEN_API_KEY, previous, now, fetcher: deps.fetcher, pause: deps.pause });
  if (stateError) checks.push({ id: "monitor-state", level: "unknown", message: "Önceki izleme kaydı okunamadı; bildirim geçmişi yeniden başlatılacak." });
  const notify = needsEmail(checks, previous, test);
  let emailSent = false;
  let emailFailure: unknown;
  if (!dryRun) {
    try {
      if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO) throw new MonitorError("E-posta gizli değişkenleri eksik; bulut takibi tamamlanmadı.");
      if (notify) {
        await sendEmail({ checks, apiKey: env.RESEND_API_KEY, to: env.ALERT_EMAIL_TO, now, test, fetcher: deps.fetcher,
          runUrl: env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined });
        emailSent = true;
      }
    } catch (error) { emailFailure = error; }
  }
  if (!dryRun) {
    const state: State = { version: 1, measuredAt: new Date(now).toISOString(),
      balanceWei: checks.find(c => c.id === "sponsor")?.balanceWei,
      notifiedFingerprint: emailSent ? fingerprint(checks) : previous?.notifiedFingerprint ?? null,
      nansenPaused: checks.find(c => c.id === "nansen")?.pauseNansen ?? false };
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath + ".tmp", JSON.stringify(state) + "\n", { mode: 0o600 });
    await rename(statePath + ".tmp", statePath);
  }
  if (emailFailure) throw emailFailure;
  return { measuredAt: new Date(now).toISOString(), checks, dryRun, emailSent };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMonitor(process.argv.slice(2)).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
    console.error(error instanceof MonitorError ? error.message : "Bulut takibi tamamlanamadı; gizli hata ayrıntıları yazdırılmadı.");
    process.exitCode = 1;
  });
}
