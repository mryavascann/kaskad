import { describe, expect, it } from "vitest";
import { href, isLocale, languageAlternates, matchRoute, ROUTES, switchLocalePath } from "./config";

describe("routes", () => {
  it("keeps English at the root and Turkish under /tr with Turkish slugs", () => {
    expect(href("home", "en")).toBe("/");
    expect(href("wallet", "en")).toBe("/wallet");
    expect(href("wallet", "tr")).toBe("/tr/cuzdan");
    expect(href("how", "tr")).toBe("/tr/nasil-calisir");
    for (const route of Object.values(ROUTES)) expect(route.tr.startsWith("/tr")).toBe(true);
  });

  it("matches pathnames, ignoring trailing slashes and queries", () => {
    expect(matchRoute("/tr/cuzdan/")).toEqual({ route: "wallet", locale: "tr" });
    expect(matchRoute("/app?demo=1")).toEqual({ route: "app", locale: "en" });
    expect(matchRoute("/")).toEqual({ route: "home", locale: "en" });
    expect(matchRoute("/nope")).toBeNull();
  });

  it("switches to the same page in the other language", () => {
    expect(switchLocalePath("/wallet", "tr")).toBe("/tr/cuzdan");
    expect(switchLocalePath("/tr/nasil-calisir", "en")).toBe("/how-it-works");
    expect(switchLocalePath("/design", "tr")).toBe("/tr");
  });

  it("builds hreflang alternates", () => {
    expect(languageAlternates("guard")).toEqual({ en: "/guard", tr: "/tr/guard", "x-default": "/guard" });
  });

  it("recognizes locales", () => {
    expect(isLocale("tr")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
});
