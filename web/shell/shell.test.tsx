import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commonMessages } from "@/i18n/messages/common";
import { DEPLOYMENT } from "@/lib/kaskad/config";

let pathname = "/wallet";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/chain/hooks/useLiveBlock", () => ({
  useLiveBlock: () => ({ block: 66_989_757n, updatedAt: 0, error: null }),
}));

const { SiteNav } = await import("./site-nav");
const { SiteFooter } = await import("./site-footer");
const { LocaleSwitch } = await import("./locale-switch");

beforeEach(() => {
  pathname = "/wallet";
});

describe("SiteNav", () => {
  it("links every page in the current locale and marks the current one", () => {
    render(<SiteNav locale="en" t={commonMessages.en} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Console" })).toHaveAttribute("href", "/app");
    expect(within(nav).getByRole("link", { name: "Is my position safe?" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
  });

  it("uses Turkish slugs and copy under /tr", () => {
    pathname = "/tr/cuzdan";
    render(<SiteNav locale="tr" t={commonMessages.tr} />);
    const nav = screen.getByRole("navigation", { name: "Ana menü" });
    expect(within(nav).getByRole("link", { name: "Param güvende mi?" })).toHaveAttribute("href", "/tr/cuzdan");
    expect(within(nav).getByRole("link", { name: "Konsol" })).toHaveAttribute("href", "/tr/app");
  });

  it("shows the live block with the locale's grouping", () => {
    render(<SiteNav locale="tr" t={commonMessages.tr} />);
    expect(screen.getAllByText("66.989.757").length).toBeGreaterThan(0);
  });

  it("opens the mobile menu as a dialog with the same links", async () => {
    const user = userEvent.setup();
    render(<SiteNav locale="en" t={commonMessages.en} />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /Guard/ })).toHaveAttribute("href", "/guard");
    expect(within(dialog).getByRole("link", { name: /Run the stress test/ })).toHaveAttribute("href", "/app");
  });

  it("offers the command menu in the bar and in the mobile menu", async () => {
    const user = userEvent.setup();
    render(<SiteNav locale="en" t={commonMessages.en} />);
    const trigger = screen.getByRole("button", { name: "Search pages, scenarios and addresses" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Search pages, scenarios and addresses/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Sound effects" })).toHaveAttribute("aria-pressed", "false");
  });

  it("has a sound toggle that starts off", () => {
    render(<SiteNav locale="tr" t={commonMessages.tr} />);
    expect(screen.getByRole("button", { name: "Ses efektleri" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("LocaleSwitch", () => {
  it("points to the same page in the other language", () => {
    render(<LocaleSwitch locale="en" t={commonMessages.en.locale} />);
    // The accessible name contains the visible text (label-content-name-mismatch).
    const link = screen.getByRole("link", { name: "TR — Türkçe" });
    expect(link).not.toHaveAttribute("aria-label");
    expect(link).toHaveAttribute("href", "/tr/cuzdan");
    expect(link).toHaveAttribute("hreflang", "tr");
  });
});

describe("SiteFooter", () => {
  it("links every deployed contract to MonadScan in a new tab", () => {
    render(<SiteFooter locale="en" t={commonMessages.en} />);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.includes("monadscan"));
    const deployed = Object.values(DEPLOYMENT.contracts).filter(Boolean).length;
    expect(links).toHaveLength(deployed);
    for (const a of links) expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps English names out of Turkish casing", () => {
    render(<SiteFooter locale="tr" t={commonMessages.tr} />);
    expect(screen.getByText("Monad Blitz İstanbul v2")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Monad mainnet Aave")).toHaveAttribute("lang", "en");
  });
});
