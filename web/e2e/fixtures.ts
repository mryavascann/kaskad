/**
 * The `test` every spec imports. It installs the safety net (e2e/safety.ts) on every context before
 * the first navigation and fails the test at teardown if anything tried to send a transaction, fund
 * the burner or reach an RPC other than the local proxy. It also collects console errors and page
 * errors for specs that assert a clean console.
 */
import { expect, test as base, type ConsoleMessage } from "@playwright/test";
import { installSafety, type SafetyGuard } from "./safety";

type Fixtures = {
  safety: SafetyGuard;
  /** Console errors and uncaught page errors seen so far on `page`. */
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  safety: [
    async ({ context }, provide, testInfo) => {
      const guard = await installSafety(context);
      await provide(guard);
      if (guard.violations.length > 0) {
        await testInfo.attach("safety-violations", { body: JSON.stringify(guard.violations, null, 2), contentType: "application/json" });
      }
      expect(guard.violations, "a test tried to send a transaction, fund the burner or bypass /api/rpc").toEqual([]);
    },
    { auto: true },
  ],
  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await provide(errors);
  },
});

export { expect };

/** True while /app still shows the stage-0 placeholder instead of the console. */
export const PLACEHOLDER_TEXT = "Being rebuilt";
