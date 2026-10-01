/**
 * The below-the-fold sections' content is server HTML that stays on screen through hydration and
 * after it, without any intent (no scroll, key, touch or mouse move): the regression this guards
 * against is a Suspense boundary waiting on intent that React client-rendered with its `null`
 * fallback when a context above it changed after hydration (the sections vanished ~0.5 s after load).
 * Here a context above the page changes right after hydration, like the root providers do.
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createContext, useEffect, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatters } from "@/i18n/format";
import { landingMessages } from "@/i18n/messages/landing";
import { MotionProvider } from "@/motion/provider";
import { openScrollIntent, resetScrollIntent } from "@/motion/scroll";
import { mockMatchMedia } from "@/motion/test-utils";

mockMatchMedia();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/three/hero-stage", () => ({ HeroStage: () => <div data-testid="hero-stage" /> }));
vi.mock("@/lib/chain/hooks/useLiveBlock", () => ({ useLiveBlock: () => ({ block: null, updatedAt: null, error: null }) }));

const { Landing } = await import("./landing");
const { recordedLanding } = await import("./__fixtures__/landing-data");

const data = { ...recordedLanding(), markets: { a: { paused: false, maxLtvBps: 9_000 }, b: { paused: true, maxLtvBps: 7_000 } } };
const f = data.finding!;
const en = formatters("en");
const t = landingMessages.en;

/** A root context whose value changes right after hydration (as the root providers' do). */
const Root = createContext(0);
function Page() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setN(1), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <Root value={n}>
      <MotionProvider>
        <Landing locale="en" data={data} />
      </MotionProvider>
    </Root>
  );
}

/** What each deferred section shows: its region's name and texts from its chart or teaser. */
const SECTIONS: [string, (region: HTMLElement) => void][] = [
  [
    t.finding.title,
    (r) => {
      // GapBars: the ratio, both bars' values and the model footnote.
      expect(within(r).getByText(en.ratio(f.stuckDebtUsd / f.clearedUsd))).toBeInTheDocument();
      expect(r.querySelector("[data-slot='gap-bars']")).not.toBeNull();
      expect(within(r).getByText(t.finding.footnote)).toBeInTheDocument();
    },
  ],
  [
    t.monad.title,
    (r) => {
      // GasGauge (both chains, the honesty labels) and the block strip.
      const gauge = r.querySelector<HTMLElement>("[data-slot='gas-gauge']")!;
      expect(gauge).not.toBeNull();
      expect(within(gauge).getByText("Measured")).toBeInTheDocument();
      expect(within(gauge).getByText("Estimate")).toBeInTheDocument();
      expect(r.querySelector("[data-slot='block-pulse']")).not.toBeNull();
    },
  ],
  [
    t.guard.title,
    (r) => {
      expect(within(r).getByRole("article", { name: "Market A" })).toHaveTextContent("Borrows open");
      expect(within(r).getByRole("article", { name: "Market B" })).toHaveTextContent("Borrows paused");
    },
  ],
  [
    t.wallet.title,
    (r) => {
      expect(within(r).getByRole("textbox", { name: "Wallet address" })).toBeInTheDocument();
      expect(within(r).getByRole("link", { name: /Largest syrupUSDC borrower/ })).toHaveAttribute("href", expect.stringMatching(/^\/wallet\?address=0x/));
      const dial = r.querySelector<HTMLElement>("[data-slot='health-dial']")!;
      expect(dial).not.toBeNull();
      expect(within(dial).getByText(en.num(data.positions!.largest!.healthFactor, 3))).toBeInTheDocument();
      expect(dial).not.toHaveAttribute("aria-busy");
    },
  ],
];

function checkSections(container: HTMLElement) {
  for (const [name, check] of SECTIONS) {
    const region = within(container).getByRole("region", { name });
    check(region);
  }
}

let root: Root | null = null;
let container: HTMLDivElement;
const recoverable: unknown[] = [];

beforeEach(() => {
  resetScrollIntent();
  recoverable.length = 0;
  container = document.createElement("div");
  container.innerHTML = renderToString(<Page />);
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

async function hydrate() {
  await act(async () => {
    root = hydrateRoot(container, <Page />, { onRecoverableError: (e) => recoverable.push(e) });
  });
  // Longer than the ~0.5 s after which the sections used to vanish; no intent in the meantime.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700));
  });
}

describe("Landing below the fold, server HTML through hydration", () => {
  it("renders every section's content on the server (no-JS readers, crawlers)", () => {
    checkSections(container);
    // Plain markup: no hidden streamed segments, no dehydrated Suspense boundaries.
    expect(container.innerHTML).not.toMatch(/<!--\$[?!]-->|<template/);
  });

  it("keeps it on screen after hydration without any intent, with a root context change", async () => {
    await hydrate();
    expect(recoverable).toEqual([]);
    checkSections(container);
  });

  it("swaps in the live parts after the first intent, keeping the content and what was typed", async () => {
    await hydrate();
    const field = screen.getByRole("textbox", { name: "Wallet address" });
    fireEvent.change(field, { target: { value: "0x1234" } });
    act(() => openScrollIntent());
    // The live wallet teaser validates on submit (the static form would navigate).
    await waitFor(
      () => {
        const live = screen.getByRole("textbox", { name: "Wallet address" });
        expect(live).not.toBe(field);
        expect(live).toHaveValue("0x1234");
      },
      { timeout: 10_000 },
    );
    fireEvent.submit(screen.getByRole("textbox", { name: "Wallet address" }).closest("form")!);
    expect(await screen.findByText(t.wallet.invalid)).toBeInTheDocument();
    checkSections(container);
  });
});
