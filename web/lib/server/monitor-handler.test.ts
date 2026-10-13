import { describe, expect, it, vi } from "vitest";
import { parseEther } from "viem";
import { handleMonitor } from "./monitor-handler";
import { MONITOR_END, type State } from "./monitor-checks";
import { type MonitorStore } from "./monitor-store";
import { ApiError } from "./request";

const NOW = Date.parse("2026-10-13T18:00:00Z");
const env = {
  KASKAD_MONITOR_SECRET: "test-monitor-secret-with-at-least-32-characters",
  NANSEN_API_KEY: "test-nansen-secret", RESEND_API_KEY: "test-mail-secret",
  ALERT_EMAIL_TO: "owner@example.com", VERCEL_ENV: "production",
};
const request = (headers: Record<string, string> = {}) => new Request("https://kaskad42.vercel.app/api/monitor", {
  method: "POST", headers: { authorization: `Bearer ${env.KASKAD_MONITOR_SECRET}`, ...headers },
});
function fixture() {
  let state: State | undefined;
  const release = vi.fn(async () => {});
  const store: MonitorStore = {
    acquire: vi.fn(async () => ({ renew: async () => {}, release })),
    read: vi.fn(async () => state),
    write: vi.fn(async (value: State) => { state = structuredClone(value); }),
  };
  const settings = { credits: 100, cost: "0", mailFails: false, pageFails: false };
  const emails: { to: string[]; subject: string; text: string }[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    if (String(url) === "https://api.nansen.ai/api/v1/account") {
      expect(headers.get("apikey")).toBe(env.NANSEN_API_KEY);
      expect(headers.has("authorization")).toBe(false);
      return Response.json({ credits_remaining: settings.credits, private_field: "never-copy" }, {
        headers: { "x-nansen-credits-used": settings.cost, "x-nansen-credits-cost": settings.cost },
      });
    }
    if (String(url) === "https://api.resend.com/emails") {
      expect(headers.get("authorization")).toBe(`Bearer ${env.RESEND_API_KEY}`);
      expect(headers.has("apikey")).toBe(false);
      if (settings.mailFails) return new Response("secret-provider-error", { status: 503 });
      emails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "email-receipt" });
    }
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("apikey")).toBe(false);
    if (String(url) === "https://kaskad42.vercel.app/api/fund") return Response.json({
      address: "0xd4a0654ee8f4a13e3beb31823c85a2f1bb8b588c", balanceWei: parseEther("14").toString(),
      reserveWei: parseEther("10").toString(), spendableWei: parseEther("4").toString(),
    });
    expect(String(url)).toMatch(/^https:\/\/kaskad42\.vercel\.app\/tr(?:\/(?:app|cuzdan|perps))?$/);
    return settings.pageFails ? new Response("secret-provider-error", { status: 503 }) : new Response("<title>Kaskad</title>");
  });
  let now = NOW;
  const run = async (req = request(), overrides = {}) => {
    const response = await handleMonitor(req, { ...env, ...overrides }, {
      now: () => now, store, fetcher, pause: async () => {},
    });
    now += 3_600_000;
    return response;
  };
  return { store, release, fetcher, settings, emails, run, state: () => state };
}

describe("protected cloud monitor", () => {
  it.each(["", "Bearer wrong", env.KASKAD_MONITOR_SECRET, `Bearer ${env.KASKAD_MONITOR_SECRET}x`])(
    "rejects invalid authorization without accessing secrets or providers: %s", async authorization => {
      const f = fixture();
      const response = await f.run(request({ authorization }));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(f.store.acquire).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
    });

  it.each([
    { KASKAD_MONITOR_SECRET: "" }, { KASKAD_MONITOR_SECRET: "short" },
    { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" },
    { NANSEN_API_KEY: "" }, { RESEND_API_KEY: "" }, { ALERT_EMAIL_TO: "" },
  ])("fails closed when configuration is incomplete or the environment is not production: %j", async overrides => {
    const f = fixture();
    expect((await f.run(request(), overrides)).status).toBe(503);
    expect(f.store.acquire).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it("stops at midnight Istanbul after November 3 without reading state or making requests", async () => {
    const f = fixture();
    const response = await handleMonitor(request(), env, { now: () => MONITOR_END, store: f.store, fetcher: f.fetcher });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ expired: true });
    expect(f.store.acquire).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it("runs six checks, persists only sanitized state, and stays quiet when healthy", async () => {
    const f = fixture();
    const response = await f.run();
    const body = await response.json();
    expect(response.status).toBe(200); expect(body.checks).toHaveLength(6);
    expect(body.checks.every((c: { level: string }) => c.level === "ok")).toBe(true);
    expect(body.emailSent).toBe(false); expect(f.emails).toHaveLength(0);
    expect(f.release).toHaveBeenCalledOnce();
    expect(JSON.stringify([body, f.state()])).not.toMatch(/test-.*secret|never-copy|owner@example/);
    expect(f.state()?.balanceWei).toBe(parseEther("14").toString());
  });

  it("notifies once per incident level, again on worsening, and once on recovery", async () => {
    const f = fixture();
    for (const credits of [99, 50, 0, 100, 100]) {
      f.settings.credits = credits;
      expect((await f.run()).status).toBe(200);
    }
    expect(f.emails).toHaveLength(3);
    expect(f.emails[0].text).toContain("99 kredi");
    expect(f.emails[1].text).toContain("0 kredi");
    expect(f.emails[2].subject).toContain("normale döndü");
    expect(f.emails.every(email => JSON.stringify(email.to) === '["owner@example.com"]')).toBe(true);
  });

  it("sends an authorized test only to the configured recipient, ignoring request URLs and body", async () => {
    const f = fixture();
    const req = new Request("https://kaskad42.vercel.app/api/monitor?to=other@example.com&url=https://evil.invalid", {
      method: "POST", headers: { authorization: `Bearer ${env.KASKAD_MONITOR_SECRET}`, "x-kaskad-monitor-test": "true" },
      body: '{"to":"other@example.com","NANSEN_API_KEY":"evil"}',
    });
    expect((await f.run(req)).status).toBe(200);
    expect(f.emails).toHaveLength(1); expect(f.emails[0].to).toEqual([env.ALERT_EMAIL_TO]);
    expect(f.emails[0].subject).toContain("test bildirimi");
  });

  it("persists a Nansen cost pause before failed email; later calls never query Nansen", async () => {
    const f = fixture(); f.settings.cost = "1"; f.settings.mailFails = true;
    const failed = await f.run();
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toMatch(/secret|never-copy/);
    expect(f.state()?.nansenPaused).toBe(true); expect(f.state()?.notifiedFingerprint).toBeNull();
    f.settings.mailFails = false;
    expect((await f.run()).status).toBe(200);
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).includes("api.nansen.ai"))).toHaveLength(1);
    expect(f.state()?.notifiedFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(f.emails).toHaveLength(1);
  });

  it("retries failed pages once and reports unknown instead of a healthy result", async () => {
    const f = fixture(); f.settings.pageFails = true;
    const response = await f.run();
    expect(response.status).toBe(200); // Resend has accepted the actual incident alert.
    const body = await response.json();
    expect(body.checks.filter((c: { level: string }) => c.level === "unknown")).toHaveLength(4);
    expect(f.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/tr/app"))).toHaveLength(2);
    expect(f.emails).toHaveLength(1); expect(JSON.stringify(f.emails)).not.toContain("secret-provider-error");
  });

  it("stops before provider queries on unreadable state and releases its lease", async () => {
    const f = fixture(); vi.mocked(f.store.read).mockRejectedValue(new Error("secret-storage-error"));
    const response = await f.run();
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });

  it("does not send email or acknowledge an incident when saving state fails", async () => {
    const f = fixture(); f.settings.credits = 0;
    vi.mocked(f.store.write).mockRejectedValue(new Error("secret-storage-error"));
    expect((await f.run()).status).toBe(503); expect(f.emails).toHaveLength(0);
    expect(f.state()).toBeUndefined(); expect(f.release).toHaveBeenCalledOnce();
  });

  it("honors cross-instance locking/rate limits before provider queries", async () => {
    const f = fixture(); vi.mocked(f.store.acquire).mockRejectedValue(new ApiError(429, "private-detail", 60));
    const response = await f.run();
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.text()).not.toContain("private-detail");
    expect(f.store.read).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
});
