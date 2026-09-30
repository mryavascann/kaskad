import { describe, expect, it } from "vitest";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import { depthNote, recoveryWhy } from "./data-notes";

describe("recoveryWhy", () => {
  it("has an English line for every recovery assumption", () => {
    for (const id of Object.keys(RECOVERY_BPS).map(Number)) {
      expect(recoveryWhy(id, "en")?.lang, `asset ${id}`).toBe("en");
      expect(recoveryWhy(id, "tr")).toEqual({ text: RECOVERY_BPS[id].why, lang: "tr" });
    }
  });

  it("returns null for assets without an assumption", () => {
    expect(recoveryWhy(0, "en")).toBeNull();
  });
});

describe("depthNote", () => {
  const assets = Object.values(DEPLOYMENT.assets);

  it("keeps measured citations verbatim and marks them English", () => {
    const syrup = DEPLOYMENT.assets["9"];
    expect(depthNote(syrup, "tr")).toEqual({ text: syrup.depthNote, lang: "en" });
    expect(depthNote(syrup, "en").text).toContain("GeckoTerminal");
  });

  it("rebuilds assumed notes in English from the data", () => {
    const usde = DEPLOYMENT.assets["2"];
    const note = depthNote(usde, "en");
    expect(note.lang).toBe("en");
    expect(note.text).toBe("Monad DEX depth is only ~$4,838; $1M assumed for a bridge or CEX exit.");
    expect(depthNote(DEPLOYMENT.assets["0"], "en").text).toBe("Not measured; $25M assumed.");
  });

  it("covers every asset in both languages", () => {
    for (const a of assets) {
      expect(depthNote(a, "en").text.length).toBeGreaterThan(10);
      expect(depthNote(a, "tr").text.length).toBeGreaterThan(10);
    }
  });
});

describe("splitNote", () => {
  it("keeps the first sentence and the rest separately", async () => {
    const { splitNote } = await import("./data-notes");
    const note = DEPLOYMENT.assets["7"].depthNote;
    const { summary, rest } = splitNote(note);
    expect(summary.endsWith(".")).toBe(true);
    expect(summary.length).toBeLessThan(note.length);
    expect(`${summary} ${rest}`).toBe(note);
  });

  it("leaves short notes whole", async () => {
    const { splitNote } = await import("./data-notes");
    expect(splitNote("Not measured; $25M assumed.")).toEqual({ summary: "Not measured; $25M assumed.", rest: null });
  });
});
