/**
 * "Guard: market B rejects the borrow" (brief section 9). Reads market B live; only when it is paused
 * does the test click "Try to borrow", because on an open market the click would send a real
 * transaction. The free eth_call pre-check must show the BorrowIsPaused revert and nothing is sent
 * (the safety fixture fails the test otherwise).
 */
import { expect, test } from "./fixtures";

test.describe("Guard", () => {
  test("market B rejects the borrow", async ({ page, safety }) => {
    await page.goto("/guard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const marketB = page.getByRole("article", { name: "Market B" });
    await expect(marketB).toBeVisible();
    const paused = marketB.getByText("Borrows paused", { exact: true });
    const open = marketB.getByText("Borrows open", { exact: true });
    // Live read of the market (useGuardMarkets): one of the two badges replaces the skeleton.
    await expect(paused.or(open)).toBeVisible({ timeout: 45_000 });
    test.skip(
      await open.isVisible(),
      "Market B is open on chain right now: clicking 'Try to borrow' would send a real transaction. Run the Guard (manually) to pause it, then re-run.",
    );

    await expect(marketB.getByText("Breaker tripped")).toBeVisible();
    // A paused market shows the free cost line, not a MON estimate.
    await expect(marketB.getByText(/Free · eth_call/)).toBeVisible();

    const callsBefore = safety.rpcMethods.filter((m) => m === "eth_call").length;
    await marketB.getByRole("button", { name: /Try to borrow/ }).click();

    const result = marketB.getByRole("status");
    await expect(result.getByText("revert BorrowIsPaused()")).toBeVisible({ timeout: 30_000 });
    await expect(result.getByText(/eth_call borrow\(/)).toBeVisible();
    await expect(result.getByText(/nothing was spent/)).toBeVisible();

    // The pre-check was an eth_call through the proxy; nothing was sent or funded.
    expect(safety.rpcMethods.filter((m) => m === "eth_call").length).toBeGreaterThan(callsBefore);
    expect(safety.rpcMethods.some((m) => m.startsWith("eth_sendRawTransaction"))).toBe(false);
    expect(safety.violations).toEqual([]);
  });

  test("TR /tr/guard renders the rule read from the Guard", async ({ page }) => {
    await page.goto("/tr/guard");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    const rule = page.getByRole("region", { name: "Kural, Guard'dan okunuyor" });
    await expect(rule).toBeVisible();
    // Values come from the chain: wait until the skeletons are replaced.
    await expect(rule.getByText(/karşılıksız borcun simüle edilen borca oranı .+ üstündeyse/)).toBeVisible({ timeout: 45_000 });
    await expect(rule.getByText(/B piyasasında borç durur, maksimum LTV/)).toBeVisible();
    await expect(rule.getByText(/senaryonun karşılıksız borç oranı/)).toBeVisible();
    await expect(page.getByRole("article", { name: "Piyasa B" })).toBeVisible();
  });
});
