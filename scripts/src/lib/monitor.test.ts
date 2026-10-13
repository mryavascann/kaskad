import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEther } from "viem";
import { runMonitor } from "../monitor.js";
import { collectChecks, fingerprint, MONITOR_END, needsEmail, parseState, sendEmail, type Check, type State } from "./monitor.js";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const sponsorBody = (balance = "13.9840090936") => ({ address: "0xd4a0654ee8f4a13e3beb31823c85a2f1bb8b588c",
  balanceWei: parseEther(balance).toString(), reserveWei: parseEther("10").toString(),
  spendableWei: (parseEther(balance) > parseEther("10") ? parseEther(balance) - parseEther("10") : 0n).toString() });
const account = (credits: unknown = 100, cost = "0") => Response.json({ user_id: "private-user", credits_remaining: credits },
  { headers: { "x-nansen-credits-used": cost, "x-nansen-credits-cost": cost } });
function server(options: { balance?: string; credits?: number } = {}): typeof fetch {
  return async (url, init) => {
    assert.equal(init?.redirect, "error");
    if (String(url).endsWith("/api/fund")) return Response.json(sponsorBody(options.balance));
    if (String(url) === "https://api.nansen.ai/api/v1/account") {
      assert.equal(new Headers(init?.headers).get("apikey"), "secret-not-for-logs");
      return account(options.credits);
    }
    assert.equal(init?.headers, undefined);
    return new Response("<html><title>Kaskad</title></html>");
  };
}
const previous = (checks: Check[]): State => ({ version: 1, measuredAt: new Date(NOW - 3600000).toISOString(), notifiedFingerprint: fingerprint(checks) });
const inspect = (fetcher: typeof fetch, extra: object = {}) => collectChecks({ key: "secret-not-for-logs", now: NOW, fetcher, pause: async () => {}, ...extra });

test("read-only healthy probes retain only allowed fields, without paid queries", async () => {
  const checks = await inspect(server());
  assert.equal(checks.length, 6);
  assert.ok(checks.every(c => c.level === "ok"));
  assert.equal(checks.find(c => c.id === "nansen")?.credits, 100);
  assert.doesNotMatch(JSON.stringify(checks), /private-user|secret-not-for-logs/);
  assert.equal(needsEmail(checks), false);
});

test("end includes November 3 Istanbul and no requests happen afterwards", async () => {
  assert.equal(MONITOR_END, Date.parse("2026-11-03T21:00:00Z"));
  assert.deepEqual(await inspect(async () => { throw new Error("must not request"); }, { now: MONITOR_END }), []);
});

test("sponsor thresholds use reserve and gas; 1 MON decline alerts", async () => {
  for (const [balance, level] of [["11.9", "warning"], ["10.9", "critical"], ["9", "critical"], ["12.00315", "ok"]]) {
    const checks = await inspect(server({ balance }));
    assert.equal(checks.find(c => c.id === "sponsor")?.level, level);
  }
  const state = { ...previous([]), balanceWei: parseEther("15").toString() };
  assert.equal((await inspect(server(), { previous: state })).find(c => c.id === "sponsor")?.level, "warning");
});

test("Nansen credits 99 warns, zero is critical; invalid balance is unknown", async () => {
  for (const [credits, level] of [[99, "warning"], [0, "critical"], [100, "ok"]] as const) {
    assert.equal((await inspect(server({ credits }))).find(c => c.id === "nansen")?.level, level);
  }
  const fallback = server();
  const checks = await inspect(async (url, init) => String(url).includes("api.nansen.ai") ? account(null) : fallback(url, init));
  assert.equal(checks.find(c => c.id === "nansen")?.level, "unknown");
  assert.equal(checks.find(c => c.id === "nansen")?.credits, undefined);
});

test("transient page failure is retried once; persistent failure stays visible", async () => {
  let calls = 0; let pauses = 0;
  const fallback = server();
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/tr/app") && ++calls === 1) return new Response("secret provider failure", { status: 503 });
    return fallback(url, init);
  };
  const checks = await inspect(fetcher, { pause: async (ms: number) => { assert.equal(ms, 30_000); pauses++; } });
  assert.equal(calls, 2); assert.equal(pauses, 1); assert.ok(checks.every(c => c.level === "ok"));
  let attempts = 0;
  const down = await inspect(async (url, init) => String(url).endsWith("/tr/app") ? (attempts++, new Response("secret", { status: 503 })) : fallback(url, init));
  assert.equal(attempts, 2); assert.equal(down.find(c => c.id === "/tr/app")?.level, "unknown");
  assert.doesNotMatch(JSON.stringify(down), /secret/);
});

test("cost changes stop later Nansen requests instead of spending credits each hour", async () => {
  const fallback = server();
  const checks = await inspect(async (url, init) => String(url).includes("api.nansen.ai") ? account(99, "1") : fallback(url, init));
  assert.equal(checks.find(c => c.id === "nansen")?.pauseNansen, true);
  const next = await inspect(async (url, init) => { assert.ok(!String(url).includes("api.nansen.ai")); return fallback(url, init); },
    { previous: { ...previous(checks), nansenPaused: true } });
  assert.equal(next.find(c => c.id === "nansen")?.level, "critical");
});

test("unchanged incidents are quiet; worsening and recovery notify", async () => {
  const healthy = await inspect(server());
  const warning = await inspect(server({ credits: 99 }));
  const lower = await inspect(server({ credits: 50 }));
  const critical = await inspect(server({ credits: 0 }));
  assert.equal(needsEmail(healthy), false);
  assert.equal(needsEmail(healthy, undefined, true), true);
  assert.equal(needsEmail(warning), true);
  assert.equal(needsEmail(lower, previous(warning)), false);
  assert.equal(needsEmail(critical, previous(warning)), true);
  assert.equal(needsEmail(healthy, previous(critical)), true);
  assert.equal(needsEmail(healthy, previous(healthy)), false);
});

test("cached state rejects invalid balances and does not preserve arbitrary fields", () => {
  assert.throws(() => parseState({ ...previous([]), balanceWei: "secret" }));
  assert.throws(() => parseState({ ...previous([]), notifiedFingerprint: "invalid" }));
  assert.equal("secret" in parseState({ ...previous([]), secret: "never copy this" }), false);
});

test("email goes only to configured recipient, uses idempotency and hides provider errors", async () => {
  const checks = await inspect(server({ credits: 0 }));
  const options = { checks, to: "owner@example.com", apiKey: "mail-secret", now: NOW, runUrl: "https://github.com/owner/repo/actions/runs/123" };
  await sendEmail({ ...options, fetcher: async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails"); assert.equal(init?.redirect, "error");
    assert.ok(new Headers(init?.headers).get("Idempotency-Key"));
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload.to, ["owner@example.com"]);
    assert.match(payload.text, /0 kredi/); assert.doesNotMatch(payload.text, /mail-secret|secret-not-for-logs/);
    return Response.json({ id: "accepted-email" });
  } });
  await assert.rejects(sendEmail({ ...options, fetcher: async () => new Response("mail-secret", { status: 403 }) }),
    error => error instanceof Error && !error.message.includes("mail-secret") && error.message.includes("gönderilemedi"));
});

test("CLI preserves a Nansen cost stop even if email fails; failed email is not acknowledged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaskad-monitor-"));
  const statePath = join(dir, "state.json");
  const fallback = server();
  const env = { NANSEN_API_KEY: "secret-not-for-logs", RESEND_API_KEY: "mail-secret", ALERT_EMAIL_TO: "owner@example.com" };
  try {
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).includes("api.nansen.ai")) return account(99, "1");
      if (String(url).includes("api.resend.com")) return new Response("secret error", { status: 503 });
      return fallback(url, init);
    };
    await assert.rejects(runMonitor([], env, { now: () => NOW, statePath, fetcher, pause: async () => {} }), /gönderilemedi/);
    const state = parseState(JSON.parse(await readFile(statePath, "utf8")));
    assert.equal(state.nansenPaused, true);
    assert.equal(state.notifiedFingerprint, null);
    await runMonitor([], env, { now: () => NOW + 3_600_000, statePath, pause: async () => {}, fetcher: async (url, init) => {
      assert.ok(!String(url).includes("api.nansen.ai"));
      return String(url).includes("api.resend.com") ? Response.json({ id: "accepted" }) : fallback(url, init);
    } });
    assert.ok(parseState(JSON.parse(await readFile(statePath, "utf8"))).notifiedFingerprint);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI dry-run never sends email or writes state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaskad-monitor-"));
  try {
    const report = await runMonitor(["--dry-run", "--send-test"], { NANSEN_API_KEY: "secret-not-for-logs" },
      { now: () => NOW, statePath: join(dir, "state.json"), fetcher: server(), pause: async () => {} });
    assert.equal(report.emailSent, false);
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
