import { describe, expect, it } from "vitest";
import { formatters, usdParts } from "./format";

const en = formatters("en");
const tr = formatters("tr");

describe("usd", () => {
  it("formats the finding in both locales", () => {
    expect(en.usd(110_987_638)).toBe("$111.0M");
    expect(tr.usd(110_987_638)).toBe("$111,0M");
    expect(en.usd(133_891)).toBe("$133.9K");
    expect(tr.usd(133_891)).toBe("$133,9K");
  });

  it("uses B in English and Mr in Turkish for billions", () => {
    expect(en.usd(1_240_000_000)).toBe("$1.24B");
    expect(tr.usd(1_240_000_000)).toBe("$1,24 Mr");
  });

  it("keeps small amounts whole and signs with a true minus", () => {
    expect(en.usd(12.4)).toBe("$12");
    expect(en.usd(-2_500_000)).toBe("−$2.5M");
  });

  it("matches the legacy Turkish formatter for millions", async () => {
    const { fmtUsd } = await import("@/lib/kaskad/format");
    for (const n of [115_900_000, 238_833_708, 3_400]) expect(tr.usd(n)).toBe(fmtUsd(n));
  });
});

describe("usdParts (NumberFlow)", () => {
  it("scales and labels the value", () => {
    expect(usdParts(110_987_638, "en")).toMatchObject({ prefix: "$", suffix: "M", locales: "en-US" });
    expect(usdParts(110_987_638, "en").value).toBeCloseTo(110.987638);
    expect(usdParts(1_240_000_000, "tr")).toMatchObject({ suffix: " Mr", locales: "tr-TR" });
    expect(usdParts(-5, "en").prefix).toBe("−$");
  });
});

describe("percent, ratio and units", () => {
  it("puts the percent sign where each language expects it", () => {
    expect(en.pct(0.03)).toBe("3.0%");
    expect(tr.pct(0.03)).toBe("%3,0");
    expect(en.drop(0.03)).toBe("−3.0%");
    expect(tr.drop(0.023)).toBe("−%2,3");
  });

  it("rounds ratios by magnitude", () => {
    expect(en.ratio(828.94)).toBe("829×");
    expect(en.ratio(23.46)).toBe("23.5×");
    expect(tr.ratio(1.066)).toBe("1,07×");
  });

  it("formats gas, bytes, blocks, MON and ms", () => {
    expect(en.gas(17_700_000)).toBe("17.7M");
    expect(en.gas(387_554)).toBe("388k");
    expect(en.bytes(29_632)).toBe("28.9 KB");
    expect(en.block(66_989_757)).toBe("#66,989,757");
    expect(tr.block(66_989_757)).toBe("#66.989.757");
    expect(en.mon(0.004)).toBe("<0.01 MON");
    expect(tr.mon(0.0396)).toBe("0,04 MON");
    expect(en.ms(309)).toBe("309 ms");
  });

  it("formats dates in UTC so server and browser agree", () => {
    expect(en.date(new Date(Date.UTC(2026, 9, 8)))).toBe("October 8, 2026");
    expect(tr.date(new Date(Date.UTC(2026, 9, 8)))).toBe("8 Ekim 2026");
  });
});
