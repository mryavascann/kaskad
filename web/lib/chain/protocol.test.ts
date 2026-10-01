import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLOSE_FACTOR, FULL_CLOSE_HF, FULL_CLOSE_MIN_USD } from "./protocol";

const sol = readFileSync(new URL("../../../contracts/src/Kaskad.sol", import.meta.url), "utf8");

describe("protocol constants mirror Kaskad.sol", () => {
  it("full-close health factor threshold", () => {
    const m = /CLOSE_FACTOR_HF_THRESHOLD\s*=\s*([\d.]+)e18/.exec(sol);
    expect(Number(m?.[1])).toBe(FULL_CLOSE_HF);
  });

  it("full-close minimum size", () => {
    const m = /MIN_BASE_MAX_CLOSE_FACTOR\s*=\s*(\d+)e18/.exec(sol);
    expect(Number(m?.[1])).toBe(FULL_CLOSE_MIN_USD);
  });

  it("half close factor", () => {
    expect(sol).toMatch(/repay = full \? d : d \/ 2;/);
    expect(CLOSE_FACTOR).toBe(0.5);
  });
});
