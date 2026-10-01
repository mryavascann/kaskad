/**
 * Keyboard-only pass (brief section 9: every flow works from the keyboard, with a visible focus).
 * Tabs to the main controls of /guard and /wallet and checks the focus ring. Nothing is activated
 * that could send a transaction: on /guard the borrow buttons are only focused, never pressed.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.skip(({ isMobile }) => isMobile, "keyboard pass runs on the desktop project");

/** Presses Tab until `target` has focus (at most `max` times). */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`could not reach ${target} with Tab in ${max} presses`);
}

/**
 * The focused element matches :focus-visible and it, or a wrapper up to two levels up (inputs draw
 * the ring on their field box via :has(input:focus-visible)), draws an outline or a ring.
 */
async function expectVisibleFocus(target: Locator) {
  const style = await target.evaluate((el) => {
    const drawn = (node: Element) => {
      const cs = getComputedStyle(node);
      return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
    };
    let ring = false;
    for (let node: Element | null = el, i = 0; node && i < 3 && !ring; node = node.parentElement, i++) ring = drawn(node);
    return { focusVisible: el.matches(":focus-visible"), ring };
  });
  expect(style.focusVisible, "element matches :focus-visible").toBe(true);
  expect(style.ring, "focus draws an outline or a ring").toBe(true);
}

test("skip link is the first stop and moves to the content", async ({ page }) => {
  await page.goto("/guard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const hash = await skip.getAttribute("href");
  expect(hash).toMatch(/^#.+/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${hash}$`));
  await expect(page.locator(hash!)).toBeInViewport();
});

test("/guard: the borrow buttons and Run the Guard are reachable with a visible focus", async ({ page }) => {
  await page.goto("/guard");
  const b = page.getByRole("article", { name: "Market B" });
  // Wait for the live read so the button is enabled (disabled buttons are not in the tab order).
  await expect(b.getByText(/Borrows (paused|open)/)).toBeVisible({ timeout: 45_000 });

  for (const target of [
    page.getByRole("article", { name: "Market A" }).getByRole("button", { name: /Try to borrow/ }),
    b.getByRole("button", { name: /Try to borrow/ }),
  ]) {
    await tabTo(page, target);
    await expect(target).toBeFocused();
    await expectVisibleFocus(target);
  }
  const run = page.getByRole("button", { name: "Run the Guard" });
  await expect(run).toBeEnabled({ timeout: 45_000 });
  await tabTo(page, run);
  await expectVisibleFocus(run);
});

test("/wallet: type an address and submit from the keyboard", async ({ page }) => {
  const lookups: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/position") lookups.push(r.url());
  });
  await page.goto("/wallet");
  const input = page.getByRole("textbox", { name: "Monad mainnet address" });
  await tabTo(page, input);
  await expectVisibleFocus(input);
  // Invalid on purpose: the flow is checked end to end without a mainnet lookup.
  await page.keyboard.type("0xabc");
  await page.keyboard.press("Enter");
  await expect(page.getByText("That is not a valid address.")).toBeVisible();

  const check = page.getByRole("button", { name: "Check", exact: true });
  await tabTo(page, check);
  await expectVisibleFocus(check);
  const sample = page.getByRole("button", { name: /Largest syrupUSDC borrower/ });
  await tabTo(page, sample);
  await expectVisibleFocus(sample);
  expect(lookups).toEqual([]);
});
