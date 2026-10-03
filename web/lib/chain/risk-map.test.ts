import { describe, expect, it } from "vitest";
import { wadToNum } from "@/lib/kaskad/format";
import { fixtureBook, fixtureRun } from "./__fixtures__/load";
import { RISK_MAP_MIN_DEBT_USD, RISK_MAP_SHOCKS_BPS, riskMapAssets, riskRow, verifyCell } from "./risk-map";

describe("risk map", () => {
  it("matches recorded on-chain previews to the dollar (syrupUSDC −3 % on Monad, USDe −5 % from Ethereum)", () => {
    const sali = fixtureRun("sali");
    const syrup = riskRow(fixtureBook("9"), "monad");
    expect(verifyCell(syrup, 300, sali.result)).toBe(true);
    // The README's finding is the −3 % cell: $111M stuck, no bad debt.
    const cell = syrup.cells.find((c) => c.shockBps === 300)!;
    expect(cell.stuckDebtUsd).toBeCloseTo(wadToNum(sali.result.stuckDebt), 0);
    expect(cell.stuckDebtUsd).toBeGreaterThan(100e6);

    const usde = riskRow(fixtureBook("14"), "ethereum");
    expect(verifyCell(usde, 500, fixtureRun("usde-eth-5-external").result)).toBe(true);
  });

  it("refuses a cell that disagrees with the chain, or a shock that is not on the map", () => {
    const sali = fixtureRun("sali");
    const row = riskRow(fixtureBook("9"), "monad");
    expect(verifyCell(row, 300, { ...sali.result, stuckDebt: sali.result.stuckDebt + 10n ** 18n * 5n })).toBe(false);
    expect(verifyCell(row, 250, sali.result)).toBe(false);
    // The worst-case preview (oracle follows the pool) is a different run: it must not pass for the external-oracle map.
    expect(verifyCell(row, 300, fixtureRun("worst").result)).toBe(false);
  });

  it("shows stuck debt turning into bad debt as the shock deepens (README: −3 % $111.0M stuck, −20 % $13.3M bad, $0.1M stuck)", () => {
    const row = riskRow(fixtureBook("9"), "monad");
    expect(row.cells.map((c) => c.shockBps)).toEqual(RISK_MAP_SHOCKS_BPS);
    expect(row.positions).toBe(57);
    const at = (bps: number) => row.cells.find((c) => c.shockBps === bps)!;
    expect(at(100)).toMatchObject({ stuckDebtUsd: 0, badDebtUsd: 0 });
    expect(at(300).stuckDebtUsd / 1e6).toBeCloseTo(111.0, 1);
    expect(at(300).badDebtUsd).toBe(0);
    // Once collateral is worth less than the debt, only the shortfall counts, as bad debt: the
    // sum of the two can fall while the loss grows. The map shows them as two measures.
    expect(at(2_000).badDebtUsd / 1e6).toBeCloseTo(13.3, 1);
    expect(at(2_000).stuckDebtUsd / 1e6).toBeCloseTo(0.1, 1);
  });

  it("lists Monad books first, largest debt first, and leaves dust books off", () => {
    const assets = riskMapAssets();
    expect(assets[0]).toEqual({ assetId: 9, group: "monad" });
    const firstEth = assets.findIndex((a) => a.group === "ethereum");
    expect(assets.slice(firstEth).every((a) => a.group === "ethereum")).toBe(true);
    expect(assets.map((a) => a.assetId)).not.toContain(0); // USDT0: ~$0.1M of debt, under RISK_MAP_MIN_DEBT_USD
    expect(RISK_MAP_MIN_DEBT_USD).toBe(250_000);
  });
});
