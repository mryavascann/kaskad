import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { howMessages } from "@/i18n/messages/how";
import type { ProofResult } from "@/lib/chain/proofs";
import { ProofLedger } from "./proof-ledger";

const wad = (usd: number) => BigInt(Math.round(usd * 1e6)) * 10n ** 12n;
const HASH = `0x${"c8".repeat(32)}` as const;

const cascade: ProofResult = {
  ok: true,
  record: {
    id: "finding",
    kind: "cascade",
    hash: HASH,
    to: null,
    status: "success",
    blockNumber: 65_835_898n,
    timestamp: Date.UTC(2026, 8, 26, 11, 8, 58),
    gasUsed: 699_687n,
    scenario: { assetId: 9, shockBps: 300, steps: 20, maxRoundsPerStep: 3, maxPositions: 57, oracleFeedbackBps: 0 },
    paths: null,
    simulation: { simId: HASH, totalLiquidated: wad(133_890.84), totalBadDebt: 0n, rounds: 3n, positionsUsed: 57n, gasUsed: 387_554n, memoryBytes: 29_632n },
    monteCarlo: null,
    guard: null,
  },
};

const failed: ProofResult = { ok: false, id: "guard", hash: HASH, error: "rpc down" };

describe("ProofLedger", () => {
  it("describes the decoded scenario and the recorded result in English", () => {
    render(<ProofLedger proofs={[cascade, failed]} t={howMessages.en.proofs} locale="en" />);
    expect(screen.getByText("syrupUSDC −3%, real book (57 positions), external price")).toBeInTheDocument();
    expect(screen.getByText("Liquidated $133.9K · bad debt $0")).toBeInTheDocument();
    expect(screen.getByText("Sep 26, 2026")).toBeInTheDocument();
    expect(screen.getByText(howMessages.en.proofs.failed)).toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.getAttribute("href")).toContain(HASH);
    }
  });

  it("uses Turkish copy and number formats", () => {
    render(<ProofLedger proofs={[cascade]} t={howMessages.tr.proofs} locale="tr" />);
    expect(screen.getByText("syrupUSDC −%3, gerçek defter (57 pozisyon), dış fiyat")).toBeInTheDocument();
    expect(screen.getByText("Likide edilen $133,9K · karşılıksız borç $0")).toBeInTheDocument();
    expect(screen.getByText("26 Eyl 2026")).toBeInTheDocument();
  });
});
