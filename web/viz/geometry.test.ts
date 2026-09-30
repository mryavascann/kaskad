import { describe, expect, it } from "vitest";
import { arcPath, blockInset, blockX, clampUnit, hideBelow, linearTicks, markerLabel, niceMax, pct, polar, round, thinLabels } from "./geometry";

const decimals = (s: string) => Math.max(0, ...(s.match(/\d+\.(\d+)/g) ?? []).map((n) => n.split(".")[1].length));

describe("round and pct", () => {
  it("rounds to 2 decimals by default and never returns -0", () => {
    expect(round(1.23456)).toBe(1.23);
    expect(round(1.23456, 4)).toBe(1.2346);
    expect(Object.is(round(-0.0001), 0)).toBe(true);
  });

  it("clamps to the unit interval", () => {
    expect(clampUnit(-1)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(0.25)).toBe(0.25);
  });

  it("writes rounded CSS percentages", () => {
    expect(pct(0.123456)).toBe("12.346%");
    expect(pct(1)).toBe("100%");
  });
});

describe("block axis", () => {
  it("insets the axis by half a block on each side", () => {
    expect(blockX(0, 20)).toBeCloseTo(0.5 / 21);
    expect(blockX(20, 20)).toBeCloseTo(20.5 / 21);
    expect(blockInset(20)).toBeCloseTo(0.5 / 21);
    expect(blockX(10, 20)).toBeCloseTo(0.5);
  });
});

describe("polar geometry", () => {
  it("measures angles from 12 o'clock, clockwise, rounded", () => {
    expect(polar(100, 100, 50, 0)).toEqual([100, 50]);
    expect(polar(100, 100, 50, 90)).toEqual([150, 100]);
    expect(polar(100, 100, 50, -90)).toEqual([50, 100]);
    const [x, y] = polar(120, 122, 100, 37.123);
    expect(decimals(`${x} ${y}`)).toBeLessThanOrEqual(2);
  });

  it("draws arcs with rounded endpoints and the right sweep flags", () => {
    const d = arcPath(120, 122, 100, -90, 90);
    expect(d).toBe("M20 122A100 100 0 0 1 220 122");
    expect(arcPath(0, 0, 10, 0, 270)).toContain(" 0 1 1 ");
    expect(decimals(arcPath(120, 122, 100, -61.7, 13.3))).toBeLessThanOrEqual(2);
  });
});

describe("scales", () => {
  it("rounds the maximum up to a nice number, 1 when there is nothing", () => {
    expect(niceMax(119_394_388)).toBe(120_000_000);
    expect(niceMax(39_470_000)).toBe(40_000_000);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(Number.NaN)).toBe(1);
  });

  it("gives ticks from 0 to the max", () => {
    expect(linearTicks(120_000_000, 3)).toEqual([0, 50_000_000, 100_000_000]);
  });
});

describe("marker labels", () => {
  it("hang beside the line on the roomier side, centred on it in narrow containers", () => {
    const left = markerLabel(0.357, 27);
    expect(left.side).toBe("right");
    expect(left.className).toContain("left-[calc(var(--x)+0.375rem)]");
    // 27 mono characters need about 15.3rem; 64 % of the width is free, so it centres below ~24rem.
    expect(left.className).toContain("@max-[24rem]:left-(--x)");
    expect(left.className).toContain("@max-[24rem]:-translate-x-(--x)");

    const right = markerLabel(0.9, 10);
    expect(right.side).toBe("left");
    expect(right.className).toContain("right-[calc(100%-var(--x)+0.375rem)]");
  });

  it("hides labels that cannot fit a narrow container", () => {
    expect(hideBelow(4)).toBeUndefined();
    expect(hideBelow(21)).toBe("@max-[22rem]:hidden");
    expect(hideBelow(500)).toBe("hidden");
  });
});

describe("thinLabels", () => {
  it("never hides the first and the last label", () => {
    const labels = Array.from({ length: 9 }, (_, i) => ({ pos: i / 8, chars: 4 }));
    const out = thinLabels(labels);
    expect(out[0]).toBeUndefined();
    expect(out[8]).toBeUndefined();
  });

  it("drops crowded labels on narrow containers only (container-query classes)", () => {
    const crowded = [0, 0.28, 0.4, 0.6, 0.68, 0.81, 0.93, 1].map((pos) => ({ pos, chars: 4 }));
    const out = thinLabels(crowded);
    expect(out.some((c) => c?.startsWith("@max-["))).toBe(true);
    expect(out.every((c) => c === undefined || /^@max-\[\d+rem\]:hidden$|^hidden$/.test(c))).toBe(true);
  });

  it("keeps sparse labels everywhere", () => {
    expect(thinLabels([{ pos: 0, chars: 2 }, { pos: 0.5, chars: 2 }, { pos: 1, chars: 2 }])).toEqual([undefined, undefined, undefined]);
  });
});
