/**
 * "Scenario → result → prove" (brief section 9) on /app. Everything up to the send is automated:
 * preset → free preview (metrics, position tiles) → "Prove on chain" with its MON cost line and the
 * >= 1 MON confirmation (cancelled). The real send is a MANUAL step (see the end of this file): it
 * spends testnet MON, and the safety fixture fails any test that tries.
 *
 * Skips itself while /app still shows the stage-0 placeholder.
 */
import type { Page } from "@playwright/test";
import { expect, PLACEHOLDER_TEXT, test } from "./fixtures";

async function openConsole(page: Page, path = "/app") {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  test.skip(await page.getByText(PLACEHOLDER_TEXT).isVisible(), `${path} still renders the "${PLACEHOLDER_TEXT}" placeholder: the console has not landed`);
}

/** The preview is done when the live region announces it (and the stage is no longer busy). */
async function waitForPreview(page: Page, announce: RegExp) {
  await expect(page.getByRole("status").filter({ hasText: announce })).toHaveCount(1, { timeout: 60_000 });
}

test.describe("Console", () => {
  test("scenario → result → prove (up to the send)", async ({ page, safety }) => {
    await openConsole(page);

    const presets = page.getByRole("group", { name: "Presets" });
    const tuesday = presets.getByRole("button", { name: /Tuesday depeg/ });
    await tuesday.click();
    await expect(tuesday).toHaveAttribute("aria-pressed", "true");

    await waitForPreview(page, /Preview ready\. Bad debt .+\. Debt that can't be liquidated instantly .+\./);
    const stage = page.getByRole("region", { name: "Result" });
    await expect(stage.getByText("Preview ready", { exact: true })).toBeVisible();
    // The two headline metrics carry dollar amounts from the preview.
    for (const label of ["Bad debt", "Debt that can't be liquidated instantly"]) {
      await expect(stage.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(stage.getByText(/^\$[\d,.]+[KMB]?$/).first()).toBeVisible();

    // Position tiles: the real book is classified position by position.
    const tiles = stage.getByRole("region", { name: "Positions" }).getByRole("img");
    await expect(tiles.first()).toBeVisible({ timeout: 45_000 });

    // Prove panel: button enabled, badge from the free preview, MON cost paid by the sponsor.
    const prove = page.getByRole("region", { name: "Prove it on chain" });
    await expect(prove.getByRole("button", { name: /Prove on chain/ })).toBeEnabled();
    await expect(prove.getByText(/Estimated cost: .*MON.* · testnet, the sponsor pays/)).toBeVisible();
    await expect(prove.getByText("free eth_call preview, nothing written")).toBeVisible();
    // Under 1 MON there is no confirmation: clicking would send. Stop here (manual step below).

    // The default scenario is read on the server (pinned block); any other scenario is a free
    // eth_call from this browser.
    await expect(stage.getByText(/Preview at Monad testnet block .+, free eth_call read on the server/)).toBeVisible();
    const tremor = presets.getByRole("button", { name: /Small tremor/ });
    await tremor.click();
    await expect(tremor).toHaveAttribute("aria-pressed", "true");
    await expect(stage.getByText("Free eth_call preview, read from this browser at the latest block")).toBeVisible({ timeout: 60_000 });
    expect(safety.rpcMethods).toContain("eth_call");
  });

  test("a heavy proof asks for confirmation; Cancel sends nothing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one pass is enough (desktop)");
    await openConsole(page);

    // The calibrated 10,000-position run is the preset most likely to cost >= 1 MON.
    await page.getByRole("group", { name: "Presets" }).getByRole("button", { name: /positions/ }).click();
    await waitForPreview(page, /Preview ready\./);

    const prove = page.getByRole("region", { name: "Prove it on chain" });
    const cost = prove.getByText(/Estimated cost: /);
    await expect(cost).toBeVisible();
    test.skip(
      !(await prove.getByText("expensive: you will be asked to confirm").isVisible()),
      `this preset costs under 1 MON right now (${await cost.textContent()}): clicking would send without a confirmation`,
    );

    await prove.getByRole("button", { name: /Prove on chain/ }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Send this transaction?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/It costs about .*MON \(testnet, the sponsor pays\)/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(prove.getByText("Not sent.")).toBeVisible();
    // The safety fixture asserts that no raw transaction and no funding request went out.
  });

  test("TR /tr/app: Salı depegi → sonuç", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "one pass is enough (mobile)");
    await openConsole(page, "/tr/app");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    // The default preset is sali; the preview runs on load.
    await expect(page.getByRole("button", { name: /Salı/ }).first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Sonuç" }).getByText("Önizleme hazır", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Zincirde kanıtla/ })).toBeEnabled();
    await expect(page.getByText(/testnet, sponsor öder/).first()).toBeVisible();
  });
});

/*
 * MANUAL STEP (not automated; spends testnet MON from the sponsor):
 *   1. Open /app in a fresh browser profile, pick "Tuesday depeg", wait for "Preview ready".
 *   2. Click "Prove on chain". Expect the progress steps (funding → sending → receipt), then the badge
 *      "1 tx · <ms> · 57 positions" and a MonadScan link whose transaction emits SimulationDone.
 */
