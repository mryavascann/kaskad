import { describe, expect, it } from "vitest";
import { ROUTES } from "@/i18n/config";
import { commonMessages } from "@/i18n/messages/common";
import { visiblePresets } from "@/lib/chain/scenario";
import { addressCommand, languageCommand, pageCommands, scenarioCommands } from "./commands";

const ADDRESS = "0x4A9B8E0fC2D16B1D5b6A5e2F1b1C3c1dF0E1a2B3";

describe("pageCommands", () => {
  it("lists every route in the current locale and marks the current one", () => {
    const tr = pageCommands("tr", commonMessages.tr, "wallet");
    expect(tr.map((p) => p.href)).toEqual(Object.values(ROUTES).map((r) => r.tr));
    expect(tr.find((p) => p.id === "wallet")).toMatchObject({ label: "Param güvende mi?", href: "/tr/cuzdan", current: true });
    expect(pageCommands("en", commonMessages.en).find((p) => p.id === "how")?.href).toBe("/how-it-works");
  });
});

describe("scenarioCommands", () => {
  it("links every visible preset to the console with ?preset=", () => {
    const list = scenarioCommands("en", commonMessages.en);
    expect(list.map((s) => s.id)).toEqual(visiblePresets().map((p) => p.id));
    for (const s of list) expect(s.href).toBe(`/app?preset=${s.id}`);
    expect(scenarioCommands("tr", commonMessages.tr)[0].href).toMatch(/^\/tr\/app\?preset=/);
  });

  it("describes a preset from its facts in the locale's format", () => {
    const sali = scenarioCommands("tr", commonMessages.tr).find((s) => s.id === "sali")!;
    expect(sali.shock).toBe("−%3,0");
    expect(sali.detail).toContain("harici oracle");
    expect(sali.detail).toContain("gerçek defter");
  });
});

describe("addressCommand", () => {
  it("offers a position check for a valid address", () => {
    expect(addressCommand(`  ${ADDRESS} `, "en")).toEqual({ kind: "valid", address: ADDRESS, href: `/wallet?address=${ADDRESS}` });
    expect(addressCommand(ADDRESS.toLowerCase(), "tr")).toMatchObject({ kind: "valid", href: `/tr/cuzdan?address=${ADDRESS.toLowerCase()}` });
  });

  it("hints at a partial address and ignores everything else", () => {
    expect(addressCommand("0x12ab", "en")).toEqual({ kind: "incomplete" });
    expect(addressCommand(`${ADDRESS}00`, "en")).toEqual({ kind: "incomplete" });
    expect(addressCommand("0x", "en")).toBeNull();
    expect(addressCommand("guard", "en")).toBeNull();
    expect(addressCommand('0x"><script>alert(1)</script>', "en")).toBeNull();
    expect(addressCommand("javascript:alert(1)", "en")).toBeNull();
  });
});

describe("languageCommand", () => {
  it("points to the same page in the other language", () => {
    expect(languageCommand("en", commonMessages.en, "/wallet")).toMatchObject({ locale: "tr", href: "/tr/cuzdan", name: "Türkçe" });
    expect(languageCommand("tr", commonMessages.tr, "/tr/nasil-calisir")).toMatchObject({ locale: "en", href: "/how-it-works" });
    expect(languageCommand("en", commonMessages.en, "/nowhere").href).toBe("/tr");
  });
});
