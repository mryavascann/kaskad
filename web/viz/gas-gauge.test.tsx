import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { limitFacts } from "@/lib/chain/limits";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { VIZ_CALIBRATED } from "./__fixtures__/load";
import { vizFormats } from "./format";
import { GasGauge } from "./gas-gauge";

const calibrated = limitFacts(VIZ_CALIBRATED.result);
const real = limitFacts(fixtureRun("sali").result);
const f = vizFormats();

describe("GasGauge", () => {
  it("shows the calibrated run fitting on Monad and overflowing Ethereum's cap", () => {
    const { container } = render(<GasGauge facts={calibrated} />);
    expect(screen.getByText("Fits in one tx")).toBeInTheDocument();
    expect(screen.getByText("Doesn't fit in one tx")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="overflow"]')).not.toBeNull();
    expect(screen.getByText(f.gas(calibrated.monad.gas))).toBeInTheDocument();
    expect(screen.getByText(f.gas(calibrated.ethereum.gasEstimate))).toBeInTheDocument();
  });

  it("labels Monad's gas as measured and Ethereum's as an estimate", () => {
    render(<GasGauge facts={calibrated} />);
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("Estimate")).toBeInTheDocument();
    expect(screen.getByText(`${f.ratio(calibrated.ethereum.multipleOfMonad)} Monad's gas`)).toBeInTheDocument();
  });

  it("says it in words for screen readers", () => {
    const { container } = render(<GasGauge facts={calibrated} />);
    const caption = container.querySelector("figcaption")?.textContent ?? "";
    expect(caption).toContain(`Monad: ${f.gas(calibrated.monad.gas)} gas of its ${f.gas(calibrated.monad.gasLimit)} per-transaction limit, measured`);
    expect(caption).toContain(`Ethereum, estimated: ${f.gas(calibrated.ethereum.gasEstimate)} gas against its ${f.gas(calibrated.ethereum.gasCap)} cap; it doesn't fit in one transaction.`);
  });

  it("has no overflow when both chains fit (57 real positions)", () => {
    const { container } = render(<GasGauge facts={real} />);
    expect(screen.getAllByText("Fits in one tx")).toHaveLength(2);
    expect(container.querySelector('[data-slot="overflow"]')).toBeNull();
    expect(screen.getByText("57 positions")).toBeInTheDocument();
  });

  it("shows memory against the Monad limit and memory gas of both chains", () => {
    render(<GasGauge facts={calibrated} />);
    expect(screen.getByText(`${f.bytes(calibrated.monad.memoryBytes)} of ${f.bytes(calibrated.monad.memoryLimit)}`)).toBeInTheDocument();
    expect(screen.getByText(f.gas(calibrated.ethereum.memoryGas))).toBeInTheDocument();
  });

  it("has loading and error states", () => {
    const { container, rerender } = render(<GasGauge facts={null} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText("Loading gas")).toBeInTheDocument();
    rerender(<GasGauge facts={null} error="failed" />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load the gas figures");
  });
});
