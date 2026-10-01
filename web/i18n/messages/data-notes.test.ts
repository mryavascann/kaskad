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

  it("keeps measured citations verbatim in English", () => {
    const syrup = DEPLOYMENT.assets["9"];
    expect(depthNote(syrup, "en")).toEqual({ text: syrup.depthNote, lang: "en" });
  });

  it("renders measured citations in Turkish from the numbers they cite, keeping the English source", () => {
    const syrup = DEPLOYMENT.assets["9"];
    const note = depthNote(syrup, "tr");
    expect(note.lang).toBe("tr");
    expect(note.text).toBe(
      "GeckoTerminal'deki 2 Monad DEX havuzunun reserve_in_usd toplamı; en büyüğü uniswap-v4-monad üzerindeki syrupUSDC / USDC 0.05% ($7.036.161). Kayma eğrisi değil, TVL yaklaşımı. DefiLlama, Monad üzerinde bunun için borç verme dışı (DEX) havuz listelemiyor.",
    );
    expect(note.source).toEqual({ text: syrup.depthNote, lang: "en" });
    expect(note.text).not.toMatch(/\b(Sum of|largest|not a slippage curve|lists no)\b/);
    expect(depthNote(DEPLOYMENT.assets["12"], "tr").text).toBe(
      "Pendle AMM likiditesi (PT ↔ SY) $2.135.230; GeckoTerminal DEX havuzları $0. PT, dayanak varlığa 1:1 yalnızca vadede dönüşür.",
    );
  });

  it("gives Turkish pages a Turkish note for every asset of the deployment", () => {
    for (const a of assets) {
      const note = depthNote(a, "tr");
      expect(note.lang, a.symbol).toBe("tr");
      expect(note.text, a.symbol).not.toMatch(/\b(Sum of|largest|assumed|Not measured)\b/);
    }
  });

  it("keeps an English citation of an unknown shape, tagged English, on Turkish pages", () => {
    const odd = { depthUsd: 1_000_000, depthIsAssumption: false, depthNote: "Read from a new source." };
    expect(depthNote(odd, "tr")).toEqual({ text: odd.depthNote, lang: "en" });
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
