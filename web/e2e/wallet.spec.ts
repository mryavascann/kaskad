/**
 * "Address → HF" (brief section 9). /api/position reads Monad mainnet through a paid RPC and allows
 * 20 lookups / 60 s per IP, so the live lookups are spread over the projects: 3 calls per full run
 * (sample chip on desktop, deep link on mobile, typed address on /tr/cuzdan on desktop). The
 * validation test makes none.
 */
import type { Page } from "@playwright/test";
import { SAMPLES } from "@/lib/chain/wallet";
import { expect, test } from "./fixtures";

const SAMPLE = SAMPLES[0];

/** Counts GET /api/position requests made by the page. */
function countPositionCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/position") calls.push(r.url());
  });
  return calls;
}

/**
 * The result of a lookup: the health dial with an HF value and the liquidation-threshold sentence,
 * or the "no debt" line when the sample has repaid since (data changes; noted, not failed).
 */
async function expectHealthResult(page: Page, copy: { dial: string; noDebt: string; threshold: RegExp }) {
  const dial = page.getByRole("figure", { name: copy.dial });
  const noDebt = page.getByText(copy.noDebt);
  await expect(dial.or(noDebt).first()).toBeVisible({ timeout: 45_000 });
  if (await noDebt.isVisible()) {
    test.info().annotations.push({ type: "data", description: "sample borrower has no debt right now: no HF to show" });
    return;
  }
  await expect(dial).not.toHaveAttribute("aria-busy", "true");
  // HF like 1.042 / 1,042 (or ∞ when there is no debt), in the readout under the dial (the scale
  // labels on the arc are aria-hidden and outside the <p>).
  await expect(dial.locator("p").getByText(/^(\d+[.,]\d{2,3}|∞)$/)).toBeVisible();
  await expect(page.getByText(copy.threshold).first()).toBeVisible();
}

const EN = {
  dial: "Health factor",
  noDebt: "No debt: no liquidation risk.",
  threshold: /You get liquidated if .+ drops|You can be liquidated right now\.|Even if .+ went to zero/,
};
const TR = {
  dial: "Sağlık faktörü",
  noDebt: "Borcun yok: likidasyon riski yok.",
  threshold: /düşerse likide olursun\.|Şu an likide edilebilirsin\.|sıfıra düşse bile/,
};

test.describe("Wallet", () => {
  test("invalid address shows a validation error and makes no lookup", async ({ page }) => {
    const calls = countPositionCalls(page);
    await page.goto("/wallet");
    const input = page.getByRole("textbox", { name: "Monad mainnet address" });
    await input.fill("0x1234");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByText("That is not a valid address.")).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await page.waitForTimeout(500);
    expect(calls).toEqual([]);
  });

  test("sample chip → health factor and liquidation threshold", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "live mainnet lookup: once per run (desktop)");
    const calls = countPositionCalls(page);
    await page.goto("/wallet");
    await page.getByRole("button", { name: /Largest syrupUSDC borrower/ }).click();
    await expectHealthResult(page, EN);
    // The URL follows the position so it can be shared.
    await expect(page).toHaveURL(new RegExp(`address=${SAMPLE.address}`, "i"));
    expect(calls).toHaveLength(1);
  });

  test("?address= deep link looks the address up on load", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "live mainnet lookup: once per run (mobile)");
    const calls = countPositionCalls(page);
    await page.goto(`/wallet?address=${SAMPLE.address}`);
    await expect(page.getByRole("textbox", { name: "Monad mainnet address" })).toHaveValue(SAMPLE.address);
    await expectHealthResult(page, EN);
    expect(calls).toHaveLength(1);
  });

  test("TR /tr/cuzdan: typed address → sağlık faktörü", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "live mainnet lookup: once per run (desktop)");
    await page.goto("/tr/cuzdan");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await page.getByRole("textbox", { name: "Monad mainnet adresi" }).fill(SAMPLE.address);
    await page.getByRole("button", { name: "Kontrol et", exact: true }).click();
    await expectHealthResult(page, TR);
  });
});
