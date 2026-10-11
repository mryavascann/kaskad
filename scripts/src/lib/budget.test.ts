import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseEther } from "viem";
import { parseOptions, runBudget } from "../budget.js";
import {
  DAY_MS, DEFAULT_SITE, MAX_TRANSFER_FEE, budgetReport, dailyWei, fetchStatus,
  horizonEnd, observe, parseHistory, parseStatus, renderBudget, siteOrigin, type Snapshot,
} from "./budget.js";

const ADDRESS = "0xd4a0654ee8f4a13e3beb31823c85a2f1bb8b588c";
const NOW = Date.parse("2026-11-02T21:00:00.000Z");
const status = (balance = "13.9840090936") => ({
  address: ADDRESS, balanceWei: parseEther(balance).toString(), reserveWei: parseEther("10").toString(),
  spendableWei: (parseEther(balance) > parseEther("10") ? parseEther(balance) - parseEther("10") : 0n).toString(),
});
const snapshot = (balance = "13.9840090936", when = NOW): Snapshot => ({
  ...status(balance), site: DEFAULT_SITE, measuredAt: new Date(when).toISOString(),
});
const fetcher = (body: unknown = status()): typeof fetch => async () => Response.json(body);
async function workspace(run: (path: string, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "kaskad-budget-test-"));
  try { await run(join(dir, "state.json"), dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("includes the entire last Istanbul day and rejects invalid calendar dates", () => {
  assert.equal(horizonEnd("2026-11-03"), Date.parse("2026-11-03T21:00:00Z"));
  for (const date of ["2026-02-29", "2026-11-31", "2026-13-01", "03/11/2026", "2026-11-03T12:00"]) {
    assert.throws(() => horizonEnd(date));
  }
  assert.equal(horizonEnd("2028-02-29"), Date.parse("2028-02-29T21:00:00Z"));
});

test("parses MON exactly and rejects rounding, negative or exponential inputs", () => {
  assert.equal(dailyWei("0.000000000000000001"), 1n);
  assert.equal(dailyWei("0"), 0n);
  for (const input of ["-1", "1e3", "1,5", "0.0000000000000000001", "Infinity", ""]) {
    assert.throws(() => dailyWei(input));
  }
});

test("site addresses cannot place secrets, paths or non-HTTPS URLs in history", () => {
  assert.equal(siteOrigin(DEFAULT_SITE + "/"), DEFAULT_SITE);
  for (const site of ["https://user:secret@example.com", "https://example.com/?token=secret",
    "https://example.com/#token", "https://example.com/api", "http://example.com", "file:///tmp/site"]) {
    assert.throws(() => siteOrigin(site));
  }
});

test("status must match the reserve policy and cannot inflate spendable balance", () => {
  assert.deepEqual(parseStatus(status()), status());
  assert.equal(parseStatus(status("9")).spendableWei, "0");
  for (const value of [
    { ...status(), address: "0x0000000000000000000000000000000000000000" },
    { ...status(), balanceWei: "1e18" },
    { ...status(), reserveWei: parseEther("9").toString() },
    { ...status(), spendableWei: parseEther("14").toString() },
    { ...status(), balanceWei: -1 }, null,
  ]) assert.throws(() => parseStatus(value));
});

test("forecast preserves reserve and a final transfer fee; gives balance-limited full grants", () => {
  const report = budgetReport(snapshot(), "2026-11-03", dailyWei("1"));
  assert.equal(report.remainingDays, 1);
  assert.equal(report.usableWei, parseEther("3.9808590936").toString());
  assert.equal(report.requiredWei, parseEther("1").toString());
  assert.equal(report.topUpWei, "0");
  assert.equal(report.fullGrantsFromBalance, "3");
  assert.equal(report.maxGrantWindowOutflowWei, parseEther("20.063").toString());
  assert.equal(report.assessment, "sufficient");
  assert.equal(report.fundingAvailable, true);
});

test("top-up covers the complete plan plus the fee buffer; never spends the reserve", () => {
  const report = budgetReport(snapshot("10.5"), "2026-11-03", dailyWei("1"));
  assert.equal(report.topUpWei, parseEther("0.50315").toString());
  assert.equal(report.affordableDailyWei, parseEther("0.49685").toString());
  assert.equal(report.assessment, "top-up-needed");
  assert.equal(report.fullGrantsFromBalance, "0");
});

test("below-reserve balances and minimum grant threshold are handled conservatively", () => {
  assert.equal(budgetReport(snapshot("9"), "2026-11-03", dailyWei("1")).usableWei, "0");
  assert.equal(budgetReport(snapshot("9"), "2026-11-03", dailyWei("1")).topUpWei, parseEther("2.00315").toString());
  assert.equal(budgetReport(snapshot("10.303149999999999999"), "2026-11-03", 0n).fundingAvailable, false);
  assert.equal(budgetReport(snapshot("10.30315"), "2026-11-03", 0n).fundingAvailable, true);
});

test("fractional days round required wei up; zero planned consumption has no finite runway", () => {
  const report = budgetReport(snapshot("11", NOW + DAY_MS / 2), "2026-11-03", 1n);
  assert.equal(report.remainingDays, 0.5);
  assert.equal(report.requiredWei, "1");
  assert.equal(budgetReport(snapshot(), "2026-11-03", 0n).runwayDays, null);
  assert.throws(() => budgetReport(snapshot("11", NOW + DAY_MS), "2026-11-03", 1n));
});

test("observation requires 24h, same sponsor/site, and no baseline older than seven days", () => {
  const current = snapshot();
  const yesterday = snapshot("15", NOW - DAY_MS);
  for (const history of [
    [], [snapshot("15", NOW - DAY_MS + 1)], [snapshot("15", NOW - 8 * DAY_MS)],
    [{ ...yesterday, site: "https://preview.example.com" }],
    [{ ...yesterday, address: "0x0000000000000000000000000000000000000001" }],
  ]) assert.equal(observe(current, history), null);
  const result = observe(current, [yesterday]);
  assert.equal(result?.netBalanceChangeWei, parseEther("-1.0159909064").toString());
  assert.equal(result?.netDecreasePerDayWei, parseEther("1.0159909064").toString());
});

test("uses newest eligible baseline and labels increases as unknown spending", () => {
  const result = observe(snapshot("14"), [snapshot("20", NOW - 2 * DAY_MS), snapshot("12", NOW - DAY_MS)]);
  assert.equal(result?.elapsedHours, 24);
  assert.equal(result?.netBalanceChangeWei, parseEther("2").toString());
  assert.equal(result?.netDecreasePerDayWei, null);
});

test("zero observed net outflow does not turn a chosen daily budget into free runway", () => {
  const report = budgetReport(snapshot("10.5"), "2026-11-03", dailyWei("1"), [snapshot("10.5", NOW - DAY_MS)]);
  assert.equal(report.observation?.netDecreasePerDayWei, "0");
  assert.equal(report.assessment, "top-up-needed");
  assert.match(renderBudget(report), /ölçülmüş harcama değil/);
  assert.match(renderBudget(report), /gerçek günlük brüt harcamayı göstermez/);
});

test("fetch only GETs public status, with timeout, no-store and redirects disabled", async () => {
  let calls = 0;
  const stub: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(input, DEFAULT_SITE + "/api/fund");
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    assert.equal(init?.headers, undefined);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    return Response.json(status());
  };
  assert.deepEqual(await fetchStatus(DEFAULT_SITE, stub), status());
  assert.equal(calls, 1);
});

test("provider failures, protected previews, malformed and oversized bodies are safe errors", async () => {
  const denied: typeof fetch = async () => new Response("secret", { status: 401 });
  await assert.rejects(fetchStatus(DEFAULT_SITE, denied), /HTTP 401/);
  const broken: typeof fetch = async () => { throw new Error("https://provider.example/secret"); };
  await assert.rejects(fetchStatus(DEFAULT_SITE, broken), error => error instanceof Error && !error.message.includes("secret"));
  await assert.rejects(fetchStatus(DEFAULT_SITE, async () => new Response("<html>login</html>")));
  await assert.rejects(fetchStatus(DEFAULT_SITE, async () => new Response("x".repeat(4_097))), /büyük/);
  await assert.rejects(fetchStatus(DEFAULT_SITE, async () => new Response(null)));
});

test("history format is validated, bounded and strips unexpected fields", () => {
  assert.deepEqual(parseHistory({ version: 1, snapshots: [{ ...snapshot(), extra: "not persisted" }] }), [snapshot()]);
  for (const value of [
    { version: 2, snapshots: [] }, { version: 1, snapshots: Array(1_001).fill(snapshot()) },
    { version: 1, snapshots: [{ ...snapshot(), measuredAt: "not a date" }] },
    { version: 1, snapshots: [{ ...snapshot(), site: DEFAULT_SITE + "?secret=x" }] },
  ]) assert.throws(() => parseHistory(value));
});

test("unknown, missing or duplicate CLI flags fail instead of silently altering the plan", () => {
  for (const args of [["--send"], ["--daily-mon"], ["--json", "--json"], ["--daily-mon", "--check"]]) {
    assert.throws(() => parseOptions(args));
  }
  assert.equal(parseOptions(["--daily-mon", "0.25"]).daily, parseEther("0.25"));
});

test("help and expired horizons perform no network requests", async () => {
  const forbidden: typeof fetch = async () => { throw new Error("should never fetch"); };
  const help = await runBudget(["--help"], forbidden);
  assert.equal(help.exitCode, 0);
  assert.match(help.output, /yalnızca GET/);
  await assert.rejects(runBudget(["--until", "2026-01-01"], forbidden, () => NOW), /geçmişte/);
});

test("CLI persists only public snapshots and returns check exit code 2 for a shortfall", async () => {
  await workspace(async (path, dir) => {
    const result = await runBudget(["--state", path, "--until", "2026-11-03", "--check", "--json"], fetcher(status("10.5")), () => NOW);
    assert.equal(result.exitCode, 2);
    assert.equal(JSON.parse(result.output).topUpWei, parseEther("0.50315").toString());
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(saved, { version: 1, snapshots: [snapshot("10.5")] });
    assert.deepEqual(await readdir(dir), ["state.json"]);
  });
});

test("second-day CLI report uses history while leaving the plan explicit", async () => {
  await workspace(async path => {
    const args = ["--state", path, "--until", "2026-11-03", "--json"];
    await runBudget(args, fetcher(status("15")), () => NOW - DAY_MS);
    const result = await runBudget(args, fetcher(status("14")), () => NOW);
    const report = JSON.parse(result.output);
    assert.equal(report.observation.netDecreasePerDayWei, parseEther("1").toString());
    assert.equal(report.plannedDailyWei, parseEther("1").toString());
    assert.equal(result.exitCode, 0);
  });
});

test("corrupt or future history is preserved; lock is cleaned up after failure", async () => {
  await workspace(async (path, dir) => {
    for (const previous of ["not json", JSON.stringify({ version: 1, snapshots: [snapshot("14", NOW + 1)] })]) {
      await writeFile(path, previous);
      await assert.rejects(runBudget(["--state", path], fetcher(), () => NOW));
      assert.equal(await readFile(path, "utf8"), previous);
      assert.deepEqual(await readdir(dir), ["state.json"]);
    }
  });
});

test("does not overwrite another process's lock or history", async () => {
  await workspace(async path => {
    await writeFile(path + ".lock", "another process");
    await assert.rejects(runBudget(["--state", path], fetcher(), () => NOW), /kilitlenemedi/);
    assert.equal(await readFile(path + ".lock", "utf8"), "another process");
    await assert.rejects(readFile(path), /ENOENT/);
  });
});

test("history retention is bounded without mixing another sponsor's observations", async () => {
  await workspace(async path => {
    const samples = Array.from({ length: 1_000 }, (_, i) => snapshot("15", NOW - (1_000 - i) * 60_000));
    await writeFile(path, JSON.stringify({ version: 1, snapshots: samples }));
    await runBudget(["--state", path], fetcher(), () => NOW);
    const saved = parseHistory(JSON.parse(await readFile(path, "utf8")));
    assert.equal(saved.length, 1_000);
    assert.deepEqual(saved.at(-1), snapshot());
    assert.equal(BigInt(budgetReport(snapshot("10.00315"), "2026-11-03", 0n).transferFeeBufferWei), MAX_TRANSFER_FEE);
  });
});
