import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { classifyPositions } from "@/lib/chain/book";
import { exposure, type BorrowerLabels } from "@/lib/chain/exposure";
import { BASE_SETTINGS } from "@/lib/chain/scenario";
import { ExposureTab } from "./exposure-tab";

const sali = fixtureRun("sali");
const slots = sali.book.positions.map((p) => p.raw);
const labels: BorrowerLabels = {
  assetId: 9,
  chain: "monad",
  sourceBlock: 108_133_182,
  total: 57,
  entries: slots.map((raw, i) => ({
    raw: `0x${raw.toString(16)}`,
    address: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    debtUsd: 0,
    labels: i === 0 ? [{ label: "Example Fund", category: "defi", kind: ["entity"] }] : [],
  })),
};
const x = exposure(classifyPositions(sali.book, sali.result, sali.scenario), slots, labels)!;

const hook = { eligible: true, exposure: x as typeof x | null, labels: labels as BorrowerLabels | null, error: null as null | "unconfigured", loading: false, retry: vi.fn() };
vi.mock("@/lib/chain/hooks/useExposure", () => ({ useExposure: () => hook }));

const settings = { ...BASE_SETTINGS, shockPct: 3 };

describe("ExposureTab", () => {
  it("states who the cascade reaches, with Nansen names on the exact positions", () => {
    render(<ExposureTab locale="en" settings={settings} scenario={sali.scenario} result={sali.result} />);
    expect(screen.getByText(/positions holding .* are liquidated or left stuck at −3%/)).toBeInTheDocument();
    expect(screen.getByText(/Largest borrower: Example Fund/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    expect(screen.getByText(/Monad Aave snapshot at block #108,133,182/)).toBeInTheDocument();
  });

  it("says so when labels are not configured, and in Turkish", () => {
    Object.assign(hook, { error: "unconfigured", exposure: null });
    render(<ExposureTab locale="tr" settings={settings} scenario={sali.scenario} result={sali.result} />);
    expect(screen.getByText("Nansen etiketleri bu dağıtımda ayarlı değil.")).toBeInTheDocument();
  });
});

it("labels the settled scenario even while the input has moved to a new shock", () => {
  Object.assign(hook, { error: null, exposure: x, labels });
  render(<ExposureTab locale="en" settings={{ ...settings, shockPct: 10 }} scenario={sali.scenario} result={sali.result} />);
  expect(screen.getByText(/positions holding .* at −3%/)).toBeInTheDocument();
});
it("allows retrying a failed lookup from the new panel", () => {
  Object.assign(hook, { error: "unconfigured", exposure: null });
  render(<ExposureTab locale="tr" settings={settings} scenario={sali.scenario} result={sali.result} />);
  fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
  expect(hook.retry).toHaveBeenCalledOnce();
});
