import { describe, expect, it } from "vitest";
import { ETH_TX_GAS_CAP, MONAD_TX_GAS_LIMIT, limitFacts } from "@/lib/chain/limits";
import { HF_DANGER, SURVIVE_HF_TARGET } from "@/lib/chain/wallet";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { VIZ_CALIBRATED } from "./__fixtures__/load";
import { HF_TARGET, gasScale, hfAngle, hfStops, hfToUnit, hfZone, memoryGasScale } from "./gauge-model";

describe("health factor scale", () => {
  it("uses the wallet page's target as the edge of the warning zone", () => {
    expect(HF_TARGET).toBe(SURVIVE_HF_TARGET);
    expect(HF_TARGET).toBe(HF_DANGER);
  });

  it("classifies zones: liquidatable under 1, warning under the target, safe above", () => {
    expect(hfZone(0.993)).toBe("liquidatable");
    expect(hfZone(1)).toBe("warning");
    expect(hfZone(1.024)).toBe("warning");
    expect(hfZone(1.05)).toBe("safe");
    expect(hfZone(143_608)).toBe("safe");
  });

  it("maps the zone edges to fixed shares of the arc", () => {
    const { domain, unit } = hfStops();
    domain.forEach((d, i) => expect(hfToUnit(d)).toBeCloseTo(unit[i], 6));
  });

  it("is monotonic and pins values outside 0.8–3 to the ends", () => {
    const hfs = [0.5, 0.8, 0.9, 1, 1.02, 1.05, 1.3, 1.5, 2, 3, 10, Infinity];
    const units = hfs.map((h) => hfToUnit(h));
    expect(units).toEqual([...units].sort((a, b) => a - b));
    expect(hfToUnit(0.1)).toBe(0);
    expect(hfToUnit(Infinity)).toBe(1);
    expect(hfToUnit(Number.NaN)).toBe(0);
  });

  it("turns units into a rounded needle angle from -90 to 90", () => {
    expect(hfAngle(0.8)).toBe(-90);
    expect(hfAngle(3)).toBe(90);
    expect(hfAngle(1)).toBe(-45);
    const a = hfAngle(1.0237);
    expect(Number.isInteger(a * 1000)).toBe(true);
  });

  it("keeps a custom target inside the scale", () => {
    const { domain } = hfStops(1.2);
    expect(domain[2]).toBe(1.2);
    expect(hfStops(5).domain[2]).toBeLessThan(1.5);
  });
});

describe("gas scale", () => {
  it("puts the calibrated run on a scale past the Ethereum estimate: it doesn't fit", () => {
    const facts = limitFacts(VIZ_CALIBRATED.result);
    const scale = gasScale(facts);
    expect(facts.monad.fitsOneTx).toBe(true);
    expect(facts.ethereum.fitsOneTx).toBe(false);
    expect(scale.max).toBeGreaterThanOrEqual(facts.ethereum.gasEstimate);
    expect(scale.at(MONAD_TX_GAS_LIMIT)).toBeLessThan(1);
    expect(scale.at(ETH_TX_GAS_CAP)).toBeLessThan(scale.at(facts.ethereum.gasEstimate));
    expect(scale.ticks[0]).toBe(0);
  });

  it("ends at the 30M Monad limit when both chains fit", () => {
    const facts = limitFacts(fixtureRun("sali").result);
    expect(facts.ethereum.fitsOneTx).toBe(true);
    expect(gasScale(facts).max).toBe(MONAD_TX_GAS_LIMIT);
  });

  it("compares memory gas of both chains on one scale", () => {
    const facts = limitFacts(VIZ_CALIBRATED.result);
    const mem = memoryGasScale(facts);
    expect(mem.at(facts.ethereum.memoryGas)).toBeGreaterThan(mem.at(facts.monad.memoryGas));
    expect(mem.at(facts.ethereum.memoryGas)).toBeLessThanOrEqual(1);
  });
});
