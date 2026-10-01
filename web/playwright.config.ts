import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite (e2e/). By default it runs against the dev server that is already up on :3000
 * (E2E_BASE_URL overrides the URL). With E2E_START=1 it builds and starts its own production server
 * on E2E_PORT (default 3100) instead. Every test runs behind the safety net in e2e/safety.ts: no
 * transaction, no sponsor funding, no RPC other than /api/rpc.
 *
 * The /api/rpc proxy allows 60 requests / 10 s per IP and /api/position 20 / 60 s: keep workers low.
 */
const CI = Boolean(process.env.CI);
const START = process.env.E2E_START === "1";
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? (START ? `http://localhost:${PORT}` : "http://localhost:3000");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // Dev compiles a route on its first hit and chain reads take seconds.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    // Service workers could answer fetches outside page.route; the safety net must see every request.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      // Pixel-like phone on Chromium (the only browser installed).
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: START
    ? {
        command: `npm run build && npm run start -- --port ${PORT}`,
        url: baseURL,
        timeout: 600_000,
        reuseExistingServer: false,
        stdout: "pipe",
      }
    : undefined,
});
