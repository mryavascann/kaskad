import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureRun } from "@/lib/chain/__fixtures__/load";
import { canClassify, classifyPositions } from "@/lib/chain/book";
import { compareRows } from "@/lib/chain/compare";
import { monteCarloFacts } from "@/lib/chain/engine";
import type { Scenario } from "@/lib/chain/types";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { vizMonteCarlo } from "@/viz/__fixtures__/load";
import type { PreviewState } from "./result-stage";

const sali = fixtureRun("sali");
const classification = classifyPositions(sali.book, sali.result, sali.scenario);
const mcRun = vizMonteCarlo("sali");

const previewCalls: Scenario[] = [];
let preview: PreviewState;
const proveMock = vi.fn();
const connect = { busy: false, error: null as null | { code: string; raw: string }, injected: null, mera: null, connectInjected: vi.fn(), connectMera: vi.fn(), selectBurner: vi.fn() };

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));
vi.mock("@/lib/chain/hooks/usePreview", () => ({
  PREVIEW_DEBOUNCE_MS: 600,
  usePreview: (s: Scenario) => {
    previewCalls.push(s);
    return preview;
  },
}));
vi.mock("@/lib/chain/hooks/usePositionMap", () => ({
  usePositionMap: (s: Scenario | null, r: unknown) => {
    const eligible = s !== null && r !== null && canClassify(s);
    return { classification: eligible ? classification : null, eligible, error: null, loading: false };
  },
}));
vi.mock("@/lib/chain/hooks/useSigner", () => ({ useSigner: () => ({ kind: "burner", address: "0x1111111111111111111111111111111111111111" }) }));
vi.mock("@/lib/chain/hooks/useSignerBalances", () => ({
  useSignerBalances: () => ({
    burner: "0x1111111111111111111111111111111111111111",
    balances: { burner: 10n ** 18n, injected: null, mera: null },
    sponsor: { address: "0x2222222222222222222222222222222222222222", balanceWei: 12n * 10n ** 18n, spendableWei: 2n * 10n ** 18n, reserveWei: 10n * 10n ** 18n },
    sponsorLow: true,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/chain/hooks/useSignerConnect", () => ({ useSignerConnect: () => connect }));
vi.mock("@/lib/chain/hooks/useMonteCarlo", () => ({
  useMonteCarlo: () => ({
    available: true,
    result: mcRun.result,
    facts: monteCarloFacts(mcRun.result),
    loading: false,
    fits: true,
    limit: null,
    searching: false,
    findLimit: vi.fn(),
  }),
}));
vi.mock("@/lib/chain/hooks/useStressCurve", () => ({ useStressCurve: () => ({ curve: null, shocksBps: [10, 50], loading: true }) }));
vi.mock("@/lib/chain/hooks/useCompare", () => ({ useCompare: () => ({ rows: compareRows().map((r) => ({ ...r, result: null, facts: null })), loading: true }) }));
vi.mock("@/lib/chain/actions/proveScenario", async (orig) => ({
  ...(await orig<typeof import("@/lib/chain/actions/proveScenario")>()),
  proveScenario: (...args: unknown[]) => proveMock(...args),
}));

const { Console } = await import("./console");
const { consolePresets } = await import("./model");

const NOW = new Date("2026-09-30T12:00:00Z");
const presets = consolePresets(NOW);
const ready = (): PreviewState => ({ result: sali.result, resultScenario: sali.scenario, loading: false, error: null, ms: 309 });
const renderConsole = (locale: "en" | "tr" = "en") => render(<Console locale={locale} presets={presets} nowMs={NOW.getTime()} />);
const lastCall = () => previewCalls[previewCalls.length - 1];

beforeEach(() => {
  previewCalls.length = 0;
  preview = ready();
  proveMock.mockReset();
  connect.error = null;
  search = new URLSearchParams();
});

describe("Console inputs", () => {
  it("starts on the Tuesday depeg preset, with copy built from the data", () => {
    renderConsole();
    const group = screen.getByRole("group", { name: "Presets" });
    expect(within(group).getByRole("button", { name: /Tuesday depeg/ })).toHaveAttribute("aria-pressed", "true");
    // The pool and debt figures come from deployment.json, not from the copy.
    const a = DEPLOYMENT.assets[9];
    expect(screen.getByText(new RegExp(`holds \\$${(a.depthUsd / 1e6).toFixed(1)}M against \\$${(a.debtUsd / 1e6).toFixed(1)}M of debt`))).toBeInTheDocument();
    expect(lastCall()).toEqual(sali.scenario);
  });

  it("derives preset numbers: ETH shock, calibrated size and the USDC depth ratio", async () => {
    const user = userEvent.setup();
    renderConsole();
    const group = screen.getByRole("group", { name: "Presets" });
    expect(within(group).getByRole("button", { name: /ETH drops 20%/ })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /10,000 positions/ })).toBeInTheDocument();
    await user.click(within(group).getByRole("button", { name: /Deep pool: USDC/ }));
    const usdc = DEPLOYMENT.assets[13];
    expect(screen.getByText(new RegExp(`${(usdc.depthUsd / usdc.debtUsd).toFixed(1)}× deeper than the debt at risk`))).toBeInTheDocument();
    expect(lastCall()).toMatchObject({ assetId: 13, shockBps: 1000 });
  });

  it("clears the preset on a manual change and re-selects one that matches", async () => {
    const user = userEvent.setup();
    renderConsole();
    const group = screen.getByRole("group", { name: "Presets" });
    await user.click(within(screen.getByRole("group", { name: "Quick shocks" })).getByRole("button", { name: "−5%" }));
    expect(within(group).queryByRole("button", { pressed: true })).toBeNull();
    expect(screen.getByText(/Custom scenario/)).toBeInTheDocument();
    expect(lastCall()).toMatchObject({ shockBps: 500 });

    await user.click(within(group).getByRole("button", { name: /Worst case: pool oracle/ }));
    expect(within(group).getByRole("button", { name: /Worst case/ })).toHaveAttribute("aria-pressed", "true");
    expect(lastCall()).toMatchObject({ shockBps: 300, oracleFeedbackBps: 10_000 });
    expect(screen.getByRole("radio", { name: "Pool price" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "External price" }));
    expect(within(group).getByRole("button", { name: /Tuesday depeg/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies ?preset= from the command menu", () => {
    search = new URLSearchParams("preset=eth");
    renderConsole();
    expect(screen.getByRole("button", { name: /ETH drops 20%/ })).toHaveAttribute("aria-pressed", "true");
    expect(lastCall()).toMatchObject({ assetId: 7, shockBps: 2000 });
  });

  it("shows the honesty labels of the run: real book, measured depth, recovery assumption", () => {
    renderConsole();
    const notes = screen.getByRole("region", { name: "What this run assumes" });
    expect(within(notes).getByText(`Real book · Monad Aave, ${DEPLOYMENT.source.borrowersWithDebt} borrowers`)).toBeInTheDocument();
    expect(within(notes).getByText("Measured")).toBeInTheDocument();
    expect(within(notes).getByText("Arbitrage recovery")).toBeInTheDocument();
    expect(within(notes).getByText("Oracle: external price (realistic)")).toBeInTheDocument();
  });

  it("switches to the synthetic book with the stress preset and says why tiles are missing", async () => {
    const user = userEvent.setup();
    renderConsole();
    await user.click(screen.getByRole("button", { name: /10,000 positions/ }));
    expect(lastCall()).toMatchObject({ assetId: 256 | 9, maxPositions: 10_000 });
    const notes = screen.getByRole("region", { name: "What this run assumes" });
    expect(within(notes).getByText("Synthetic sample · 10,000 positions")).toBeInTheDocument();
  });

  it("marks PT maturity with the days left from the server clock", async () => {
    const user = userEvent.setup();
    renderConsole();
    await user.click(screen.getByRole("button", { name: /PT maturity rush/ }));
    expect(screen.getByText(/PT-AUSD, 8 days before maturity/)).toBeInTheDocument();
    expect(screen.getByText("PT-AUSD matures on October 8, 2026 (8 days left)")).toBeInTheDocument();
  });
});

describe("Console result stage", () => {
  it("shows the hero numbers with their share of the debt and announces the result", () => {
    renderConsole();
    expect(screen.getByText("Preview ready")).toBeInTheDocument();
    expect(screen.getByText("$111.0M", { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.getByText("89.7% of total debt")).toBeInTheDocument();
    expect(screen.getByText(/Preview ready\. Bad debt \$0\. Debt that can't be liquidated instantly \$111\.0M\./)).toBeInTheDocument();
    expect(screen.getByText(/syrupUSDC drops 3% over 20 blocks and liquidations start/)).toBeInTheDocument();
    expect(screen.getByText("309 ms · 57 positions")).toBeInTheDocument();
  });

  it("drives the tiles from the timeline scrubber", () => {
    renderConsole();
    expect(screen.getByRole("img", { name: /57 positions at the end of the run: 0 with bad debt, 30 stuck/ })).toBeInTheDocument();
    const scrubber = screen.getByRole("slider", { name: "Block" });
    act(() => scrubber.focus());
    fireEvent.keyDown(scrubber, { key: "Home" });
    expect(screen.getByRole("img", { name: /57 positions at block 0 of 20/ })).toBeInTheDocument();
  });

  it("keeps same-size skeletons while the first preview loads", () => {
    preview = { result: null, resultScenario: null, loading: true, error: null, ms: 0 };
    renderConsole();
    expect(screen.getByText("Computing the preview")).toBeInTheDocument();
    expect(screen.getAllByText("Loading").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Prove on chain" })).toBeDisabled();
  });

  it("explains an out-of-gas preview as one transaction too many", () => {
    preview = { result: null, resultScenario: null, loading: false, error: { code: "out-of-gas", raw: "out of gas" }, ms: 0 };
    renderConsole();
    expect(screen.getByRole("alert")).toHaveTextContent("Doesn't fit in one transaction");
  });

  it("proves the scenario with the mocked action and shows the tx badge", async () => {
    proveMock.mockImplementation(async (_s: Scenario, _r: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ step: "sending", detail: "sync", raw: "" });
      opts.onEvent({ step: "confirmed", raw: "" });
      return { status: "confirmed", hash: `0x${"ab".repeat(32)}`, ms: 412, sync: true, receipt: {}, rounds: 1, simulationDone: null };
    });
    const user = userEvent.setup();
    renderConsole();
    await user.click(screen.getByRole("button", { name: "Prove on chain" }));
    expect(proveMock).toHaveBeenCalledWith(sali.scenario, sali.result, expect.objectContaining({ onEvent: expect.any(Function), confirm: expect.any(Function) }));
    expect(await screen.findByText("1 tx · 412 ms · 57 positions")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /MonadScan · 0xabab/ });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("Console signer and tabs", () => {
  it("shows the signer, balances and the low sponsor warning", () => {
    renderConsole();
    const strip = screen.getByRole("region", { name: "Signer and gas" });
    expect(within(strip).getByText("Temporary wallet (sponsored)")).toBeInTheDocument();
    expect(within(strip).getByText("1.00 MON")).toBeInTheDocument();
    expect(within(strip).getByText("2.00 MON")).toBeInTheDocument();
    expect(within(strip).getByText(/10\.00 MON reserve excluded/)).toBeInTheDocument();
    expect(within(strip).getByRole("status")).toHaveTextContent("Running low");
    expect(within(strip).getByRole("link", { name: /Get testnet MON/ })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("offers browser wallet and Mera passkey from the signer menu", async () => {
    const user = userEvent.setup();
    renderConsole();
    await user.click(screen.getByRole("button", { name: /Switch signer/ }));
    await user.click(await screen.findByRole("button", { name: "Mera: sign in" }));
    expect(connect.connectMera).toHaveBeenCalledWith("login");
  });

  it("opens Monte Carlo by default and the two-network table on demand", async () => {
    const user = userEvent.setup();
    renderConsole();
    expect(screen.getByRole("tab", { name: "Monte Carlo" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("slider", { name: "Paths (K)" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Two networks" }));
    const table = screen.getByRole("table", { name: "The same shock on books from both chains" });
    expect(within(table).getAllByRole("row")).toHaveLength(compareRows().length + 1);
  });
});

describe("Console in Turkish", () => {
  it("renders the Turkish copy", () => {
    renderConsole("tr");
    expect(screen.getByRole("group", { name: "Hazır senaryolar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salı depegi/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Ne oldu?")).toBeInTheDocument();
    expect(screen.getByText("toplam borcun %89,7 kadarı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zincirde kanıtla" })).toBeInTheDocument();
    expect(screen.getByText(/syrupUSDC 20 blokta %3 düşünce/)).toBeInTheDocument();
  });
});
