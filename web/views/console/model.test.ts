import { describe, expect, it } from "vitest";
import { formatters } from "@/i18n/format";
import { buildScenario, PRESETS, presetFacts } from "@/lib/chain/scenario";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { consolePresets, crossesLiquidation, presetText, settingsForScenario, shockLabel } from "./model";

const en = formatters("en");
const tr = formatters("tr");

describe("console model", () => {
  it("prints shocks with the decimals they need", () => {
    expect(shockLabel(3, en)).toBe("−3%");
    expect(shockLabel(0.3, en)).toBe("−0.3%");
    expect(shockLabel(12.5, tr)).toBe("−%12,5");
  });

  it("turns preset facts into copy numbers from deployment.json", () => {
    const f = presetFacts("derin", new Date("2026-09-30T00:00:00Z"));
    const usdc = DEPLOYMENT.assets[13];
    expect(presetText(f, en)).toMatchObject({ symbol: "USDC", shock: "10%", depthToDebt: en.ratio(usdc.depthUsd / usdc.debtUsd) });
    expect(presetText(presetFacts("pt", new Date("2026-09-30T00:00:00Z")), en).days).toBe("8");
    expect(presetText(presetFacts("pt", new Date("2026-10-09T00:00:00Z")), en).days).toBeNull();
  });

  it("recovers the settings behind every preset scenario", () => {
    for (const p of PRESETS) {
      const back = settingsForScenario(buildScenario(p.settings));
      expect(buildScenario(back)).toEqual(buildScenario(p.settings));
    }
  });

  it("gives the client plain, serializable presets", () => {
    const list = consolePresets(new Date("2026-09-30T00:00:00Z"));
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
  });
});

describe("crossesLiquidation", () => {
  const pts = [0, 0, 3, 0, 1].map((liquidations) => ({ liquidations }));
  it("checks the blocks passed going forward and back", () => {
    expect(crossesLiquidation(pts, 0, 1)).toBe(false);
    expect(crossesLiquidation(pts, 1, 2)).toBe(true);
    expect(crossesLiquidation(pts, 0, 4)).toBe(true);
    expect(crossesLiquidation(pts, 3, 3)).toBe(false);
    expect(crossesLiquidation(pts, 4, 3)).toBe(false);
    expect(crossesLiquidation(pts, 3, 2)).toBe(true);
  });
});
