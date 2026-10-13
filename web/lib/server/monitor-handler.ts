import { createHash, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { collectChecks, fingerprint, MONITOR_END, needsEmail, sendEmail, type State } from "./monitor-checks";
import { monitorStore, type MonitorStore } from "./monitor-store";
import { ApiError, json } from "./request";

type Env = Record<string, string | undefined>;
type Deps = { now?: () => number; fetcher?: typeof fetch; store?: MonitorStore; pause?: (ms: number) => Promise<unknown> };
const digest = (value: string) => createHash("sha256").update(value).digest();

/** No request data chooses a destination, recipient, or API credential. */
export async function handleMonitor(request: Request, env: Env = process.env, deps: Deps = {}) {
  const secret = env.KASKAD_MONITOR_SECRET;
  if (!secret || secret.length < 32 || (env.VERCEL_ENV && env.VERCEL_ENV !== "production")) {
    return json({ error: "Monitor is not configured for this environment." }, 503);
  }
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const now = (deps.now ?? Date.now)();
  if (now >= MONITOR_END) return json({ expired: true });
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO || !env.NANSEN_API_KEY) {
    return json({ error: "Monitor configuration is incomplete." }, 503);
  }
  // cron-job.org's free request limit is 30s. Bound the complete request and
  // each provider call, and use one short retry instead of the CLI's 30s wait.
  const deadline = AbortSignal.timeout(25_000);
  const fetcher: typeof fetch = (input, init) => (deps.fetcher ?? fetch)(input, {
    ...init, cache: "no-store", redirect: "error",
    signal: AbortSignal.any([deadline, AbortSignal.timeout(4_000), ...(init?.signal ? [init.signal] : [])]),
  });
  let lease: Awaited<ReturnType<MonitorStore["acquire"]>> | undefined;
  try {
    const store = deps.store ?? monitorStore(env, fetcher);
    lease = await store.acquire();
    const previous = await store.read();
    const checks = await collectChecks({ key: env.NANSEN_API_KEY, previous, now, fetcher,
      pause: deps.pause ?? (() => delay(1_000, undefined, { signal: deadline })) });
    const state: State = {
      version: 1, measuredAt: new Date(now).toISOString(),
      balanceWei: checks.find(c => c.id === "sponsor")?.balanceWei,
      notifiedFingerprint: previous?.notifiedFingerprint ?? null,
      nansenPaused: checks.find(c => c.id === "nansen")?.pauseNansen ?? false,
    };
    // Persist a cost-related pause BEFORE trying email, even if mail is down.
    await store.write(state);
    const test = request.headers.get("x-kaskad-monitor-test") === "true";
    let emailSent = false;
    if (needsEmail(checks, previous, test)) {
      await sendEmail({ checks, apiKey: env.RESEND_API_KEY, to: env.ALERT_EMAIL_TO, now, test, fetcher });
      emailSent = true;
      await store.write({ ...state, notifiedFingerprint: fingerprint(checks) });
    }
    await lease.release();
    lease = undefined;
    // A known issue is sent through Resend. Non-2xx means the monitor itself
    // failed, so the external scheduler must send its independent failure mail.
    return json({ measuredAt: state.measuredAt, checks, emailSent });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return json({ error: "Monitor is busy or was called too recently." }, 429, error.retryAfter);
    }
    return json({ error: "Monitoring did not complete. Check the monitor configuration and provider status." }, 503);
  } finally {
    if (lease) await lease.release().catch(() => undefined);
  }
}
