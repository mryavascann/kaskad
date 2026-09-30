/**
 * Every page answers 200 with exactly one h1, a clean console and no horizontal scroll at 360 px;
 * legacy Turkish URLs redirect with their query; unknown URLs get the 404 page.
 */
import { expect, test } from "./fixtures";

const ROUTES = ["/", "/tr", "/app", "/tr/app", "/guard", "/tr/guard", "/wallet", "/tr/cuzdan", "/how-it-works", "/tr/nasil-calisir"] as const;

/**
 * Console noise that is not an app error: dev-only tooling messages, and RPC hiccups (rate limit /
 * upstream) that the pages already render as an error state. Keep this list short and specific.
 */
const IGNORED = [/Download the React DevTools/i, /\[HMR\]/, /\[Fast Refresh\]/];

const SAMPLE_ADDRESS = "0x815f5BB257e88b67216a344C7C83a3eA4EE74748";

test.describe("smoke", () => {
  for (const route of ROUTES) {
    test(`${route} renders cleanly`, async ({ page, pageErrors }) => {
      const res = await page.goto(route, { waitUntil: "load" });
      expect(res?.status(), `${route} status`).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", route === "/tr" || route.startsWith("/tr/") ? "tr" : "en");

      // Let client components hydrate and fire their first reads.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const errors = pageErrors.filter((e) => !IGNORED.some((re) => re.test(e)));
      expect(errors, `console / page errors on ${route}`).toEqual([]);
    });
  }

  test("no horizontal scroll at 360 px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "one pass is enough (runs on the mobile project)");
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 360, height: 780 });
    const overflowing: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      const { scrollWidth, clientWidth } = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      if (scrollWidth > clientWidth) overflowing.push(`${route}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`);
    }
    expect(overflowing).toEqual([]);
  });

  test("legacy /cuzdan redirects to /tr/cuzdan with the address", async ({ request }) => {
    const res = await request.get(`/cuzdan?address=${SAMPLE_ADDRESS}`, { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(res.status());
    const location = new URL(res.headers()["location"], "http://x");
    expect(location.pathname).toBe("/tr/cuzdan");
    expect(location.searchParams.get("address")).toBe(SAMPLE_ADDRESS);
  });

  test("legacy /baglan redirects to /tr/app", async ({ request }) => {
    const res = await request.get("/baglan", { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(res.status());
    expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/tr/app");
  });

  test("the /cuzdan redirect lands on the Turkish wallet page in the browser", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one pass is enough");
    // Invalid-looking address on purpose: the page ignores it, so no mainnet lookup is made.
    await page.goto("/cuzdan?address=0xnot-an-address");
    await expect(page).toHaveURL(/\/tr\/cuzdan\?address=0xnot-an-address$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  });

  test("unknown URL shows the 404 page", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "This page is not on the chain." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Kaskad" })).toHaveAttribute("href", "/");
  });
});
