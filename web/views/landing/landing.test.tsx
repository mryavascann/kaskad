import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { formatters } from "@/i18n/format";
import { landingMessages } from "@/i18n/messages/landing";
import { DEPLOYMENT } from "@/lib/kaskad/config";
import { mockMatchMedia } from "@/motion/test-utils";

mockMatchMedia();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The WebGL stage is covered by web/three's own tests; here it is a box.
vi.mock("@/three/hero-stage", () => ({ HeroStage: () => <div data-testid="hero-stage" /> }));
vi.mock("@/lib/chain/hooks/useLiveBlock", () => ({ useLiveBlock: () => ({ block: null, updatedAt: null, error: null }) }));
// No scroll library in jsdom: the scene stays at its first frame.
vi.mock("@/motion/scroll", async (orig) => ({ ...(await orig<typeof import("@/motion/scroll")>()), loadScrollKit: () => new Promise(() => {}) }));

const { Landing } = await import("./landing");
const { recordedLanding, EMPTY_LANDING } = await import("./__fixtures__/landing-data");

const data = recordedLanding();
const f = data.finding!;
const en = formatters("en");

beforeAll(() => {
  expect(f).not.toBeNull();
});

describe("Landing (EN)", () => {
  it("has the headline as the page's only h1 and one h2 per section", () => {
    render(<Landing locale="en" data={data} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("One transaction. Every liquidation wave.");
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const t = landingMessages.en;
    for (const title of [t.finding.title, t.onchain.title, t.monad.title, t.guard.title, t.wallet.title, t.how.title]) {
      expect(titles).toContain(title);
    }
  });

  it("puts the live finding in the hero from the given data, with its honesty labels", () => {
    render(<Landing locale="en" data={data} />);
    expect(screen.getByText("Debt that can't be liquidated instantly at −3% syrupUSDC")).toBeInTheDocument();
    expect(screen.getAllByText(en.usd(f.stuckDebtUsd)).length).toBeGreaterThan(0);
    expect(screen.getByText(`Live preview · Monad testnet block ${en.block(f.blockNumber!)}`)).toBeInTheDocument();
    expect(
      screen.getByText(`Real book: Monad Aave, ${en.int(DEPLOYMENT.source.borrowersWithDebt)} borrowers (${en.int(f.positionsUsed)} syrupUSDC positions)`),
    ).toBeInTheDocument();
  });

  it("links the CTAs to the console and the wallet page", () => {
    render(<Landing locale="en" data={data} />);
    expect(screen.getAllByRole("link", { name: /Run the stress test/ })[0]).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Is my position safe?" })).toHaveAttribute("href", "/wallet");
  });

  it("states the gap with the computed ratio and always shows the model footnote", () => {
    render(<Landing locale="en" data={data} />);
    const section = screen.getByRole("region", { name: landingMessages.en.finding.title });
    expect(within(section).getAllByText(en.usd(f.clearedUsd)).length).toBeGreaterThan(0);
    expect(within(section).getByText(en.ratio(f.stuckDebtUsd / f.clearedUsd))).toBeInTheDocument();
    expect(within(section).getByText(landingMessages.en.finding.footnote)).toBeVisible();
    expect(within(section).getByText(`${data.positions!.belowThreshold} of ${data.positions!.total}`)).toBeInTheDocument();
  });

  it("quotes the MIP-8 read costs from lib/chain/limits with the computed ratio", () => {
    render(<Landing locale="en" data={data} />);
    expect(screen.getByText("162.5 gas")).toBeInTheDocument();
    expect(screen.getByText("2,100 gas")).toBeInTheDocument();
    expect(screen.getByText("12.9× cheaper per position")).toBeInTheDocument();
  });

  it("validates addresses and offers the sample borrowers", () => {
    render(<Landing locale="en" data={data} />);
    expect(screen.getByRole("textbox", { name: "Wallet address" })).toBeInTheDocument();
    const sample = screen.getByRole("link", { name: /Largest syrupUSDC borrower/ });
    expect(sample.getAttribute("href")).toMatch(/^\/wallet\?address=0x[0-9a-fA-F]{40}$/);
  });

  it("renders skeletons instead of numbers when the chain could not be read", () => {
    render(<Landing locale="en" data={EMPTY_LANDING} />);
    expect(screen.getByText("Live preview unavailable right now")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: landingMessages.en.finding.title }).querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText(/\$111/)).toBeNull();
    expect(screen.getByText(landingMessages.en.guard.missing)).toBeInTheDocument();
  });
});

describe("Landing (TR)", () => {
  it("uses the Turkish copy and number format", () => {
    const tr = formatters("tr");
    render(<Landing locale="tr" data={data} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tek işlem. Tüm likidasyon dalgaları.");
    expect(screen.getByText("syrupUSDC −%3 düşerse anında likide edilemeyen borç")).toBeInTheDocument();
    expect(screen.getAllByText(tr.usd(f.stuckDebtUsd)).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Param güvende mi?" })).toHaveAttribute("href", "/tr/cuzdan");
    expect(screen.getByText(landingMessages.tr.finding.footnote)).toBeInTheDocument();
  });
});
