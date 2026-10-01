import { describe, expect, it } from "vitest";
import { fill, mergeCopy } from "./copy";
import { vizFormats, withFormats } from "./format";

describe("vizFormats (en-US defaults)", () => {
  const f = vizFormats();

  it("formats USD compactly with one decimal from $1K, whole dollars below", () => {
    expect(f.usd(110_987_638.08)).toBe("$111.0M");
    expect(f.usd(133_890.84)).toBe("$133.9K");
    expect(f.usd(950)).toBe("$950");
    expect(f.usd(0)).toBe("$0");
  });

  it("keeps axis ticks short", () => {
    expect(f.usdTick(150_000_000)).toBe("$150M");
    expect(f.usdTick(2_500_000)).toBe("$2.5M");
    expect(f.pctTick(0.1)).toBe("10%");
    expect(f.pctTick(0.005)).toBe("0.5%");
  });

  it("gives prices four decimals under $10 and two above", () => {
    expect(f.price(1.184758)).toBe("$1.1848");
    expect(f.price(0.0479)).toBe("$0.0479");
    expect(f.price(2512.4)).toBe("$2,512.40");
  });

  it("formats fractions as percentages and signs changes with a typographic minus", () => {
    expect(f.pct(0.03)).toBe("3.0%");
    expect(f.change(-0.03)).toBe("−3.0%");
    expect(f.change(0.012)).toBe("+1.2%");
    expect(f.change(0)).toBe("0.0%");
    expect(f.change(-0)).toBe("0.0%");
    expect(f.change(-0.0001)).toBe("0.0%");
  });

  it("formats integers, gas, bytes, ratios, health factors and plain numbers", () => {
    expect(f.int(66_990_055)).toBe("66,990,055");
    expect(f.gas(14_980_382)).toBe("14.98M");
    expect(f.gas(387_554)).toBe("387.6K");
    expect(f.bytes(1_618_368)).toBe("1.54 MB");
    expect(f.bytes(29_632)).toBe("28.9 KB");
    expect(f.bytes(512)).toBe("512 B");
    expect(f.ratio(828.94)).toBe("~829×");
    expect(f.ratio(2.63)).toBe("~2.6×");
    expect(f.hf(1.0237)).toBe("1.024");
    expect(f.hf(12.5)).toBe("12.50");
    expect(f.hf(143_608.5)).toBe("143,609");
    expect(f.num(1.05)).toBe("1.05");
    expect(f.num(3)).toBe("3");
  });

  it("is cached per locale", () => {
    expect(vizFormats("en-US")).toBe(f);
  });
});

describe("other locales and overrides", () => {
  it("follows the locale's separators (Turkish)", () => {
    const tr = vizFormats("tr-TR");
    expect(tr.int(66_990_055)).toBe("66.990.055");
    expect(tr.price(1.184758)).toContain("1,1848");
  });

  it("puts caller overrides on top of the defaults", () => {
    const custom = (v: number) => `USD ${v}`;
    const f = withFormats("en-US", { usd: custom, price: undefined });
    expect(f.usd(1)).toBe("USD 1");
    expect(f.price(1)).toBe("$1.0000");
  });

  it("returns the cached defaults when nothing is overridden", () => {
    expect(withFormats(undefined, {})).toBe(vizFormats("en-US"));
  });
});

describe("copy", () => {
  it("fills named placeholders and leaves unknown ones visible", () => {
    expect(fill("Block {block} of {steps}", { block: 7, steps: "20" })).toBe("Block 7 of 20");
    expect(fill("Block {blok}", { block: 7 })).toBe("Block {blok}");
  });

  it("merges overrides over the defaults, skipping undefined keys", () => {
    const defaults = { a: "A", b: "B" };
    expect(mergeCopy(defaults, { b: "b", a: undefined })).toEqual({ a: "A", b: "b" });
    expect(mergeCopy(defaults)).toBe(defaults);
  });
});
