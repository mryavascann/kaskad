import { describe, expect, it } from "vitest";
import { findingFacts, findingScenario } from "@/lib/chain/finding";
import type { Result } from "@/lib/chain/types";
import { ogAlt, ogCopy } from "./copy";
import { findingCard, formatRatio, guardCard, ogUpper, settleWithin, staticCard, type GuardSnapshot } from "./format";

const WAD = 10n ** 18n;
const usd = (n: number) => BigInt(Math.round(n * 100)) * (WAD / 100n);

// Test input only: shaped like an engine Result, values chosen to exercise formatting.
const result: Result = {
  totalDebt: usd(123_685_701.86),
  totalCollateral: usd(150_000_000),
  totalLiquidated: usd(133_890.84),
  totalSeized: usd(140_000),
  badDebt: 0n,
  stuckDebt: usd(110_987_638.08),
  startPrice: usd(1.18),
  finalPrice: usd(1.15),
  rounds: 1,
  liquidations: 1,
  positionsUsed: 57,
  gasUsed: 387_554n,
  memoryBytes: 29_632n,
  log: [],
};

const finding = findingFacts(result, findingScenario(), {
  engine: "0x0000000000000000000000000000000000000001",
  blockNumber: 66_989_757n,
  fetchedAt: 0,
});

describe("ogUpper", () => {
  it("follows Turkish casing, and keeps English terms English", () => {
    expect(ogUpper("canlı bulgu · bilgi", "tr")).toBe("CANLI BULGU · BİLGİ");
    expect(ogUpper(["kazanan · ", { en: "Blitz" }], "tr")).toBe("KAZANAN · BLITZ");
    expect(ogUpper("live finding", "en")).toBe("LIVE FINDING");
  });
});

describe("formatRatio", () => {
  it("drops decimals above 100 and uses the locale's separator below", () => {
    expect(formatRatio(828.94, "en")).toBe("829×");
    expect(formatRatio(23.46, "en")).toBe("23.5×");
    expect(formatRatio(23.46, "tr")).toBe("23,5×");
  });
});

describe("findingCard", () => {
  it("shows stuck debt, cleared and the gap from the finding", () => {
    const card = findingCard("home", "en", finding);
    expect(card.metrics.map((m) => m.value)).toEqual(["$111.0M", "$133.9K", "829×"]);
    expect(card.metrics.map((m) => m.label)).toEqual(["STUCK DEBT", "CLEARED BY LIQUIDATORS", "GAP"]);
    expect(card.status).toBe("MONAD TESTNET · BLOCK 66,989,757");
    expect(card.kicker).toBe("LIVE FINDING · SYRUPUSDC −3.0%");
    expect(card.source).toContain("57 positions");
  });

  it("formats Turkish numbers like the pages", () => {
    const card = findingCard("app", "tr", finding);
    expect(card.metrics.map((m) => m.value)).toEqual(["$111,0M", "$133,9K", "829×"]);
    expect(card.status).toBe("MONAD TESTNET · BLOK 66.989.757");
    expect(card.title).toBe(ogCopy.tr.pages.app.title);
    expect(card.metrics[1].label).toBe("LİKİDATÖRLERİN TEMİZLEDİĞİ");
  });

  it("omits the gap when nothing was liquidated", () => {
    const none = findingFacts({ ...result, totalLiquidated: 0n }, findingScenario(), { engine: finding.engine, blockNumber: null, fetchedAt: 0 });
    const card = findingCard("home", "en", none);
    expect(card.metrics.map((m) => m.label)).not.toContain("GAP");
    expect(card.status).toBeNull();
  });

  it("falls back to the title alone when the chain could not be read", () => {
    const card = findingCard("home", "en", null);
    expect(card).toEqual({ kicker: "ON-CHAIN LIQUIDATION CASCADE ENGINE", title: ogCopy.en.pages.home.title, metrics: [], source: null, status: null });
  });
});

describe("guardCard", () => {
  const snap: GuardSnapshot = {
    config: { badDebtThresholdBps: 50, safeLtvBps: 7_000, scenario: { ...findingScenario(), oracleFeedbackBps: 10_000 } },
    market: { paused: true, maxLtvBps: 7_000 },
    symbol: "syrupUSDC",
    block: 1_234n,
  };

  it("prints the stored rule and the market state", () => {
    const card = guardCard("en", snap);
    expect(card.metrics.map((m) => m.value)).toEqual(["0.5%", "70%", "Borrowing paused"]);
    expect(card.metrics[2]).toMatchObject({ kind: "text", tone: "safe" });
    expect(card.source).toBe("Scenario: syrupUSDC −3.0%");
    expect(guardCard("tr", snap).metrics.map((m) => m.value)).toEqual(["%0,5", "%70", "Borç verme durdu"]);
  });

  it("leaves out the market when it could not be read, and everything when the Guard could not", () => {
    expect(guardCard("en", { ...snap, market: null }).metrics).toHaveLength(2);
    const fallback = guardCard("en", null);
    expect(fallback.metrics).toEqual([]);
    expect(fallback.status).toBeNull();
    expect(fallback.source).toBeNull();
  });
});

describe("staticCard", () => {
  it("cites the snapshot block, or nothing", () => {
    expect(staticCard("wallet", "tr", 108_133_182).source).toBe("Borçlu verisi: Monad mainnet Aave, blok 108.133.182");
    expect(staticCard("how", "en", null).source).toBeNull();
    expect(staticCard("how", "en", null).metrics).toEqual([]);
  });
});

describe("settleWithin", () => {
  it("passes a value through, and turns errors and timeouts into null", async () => {
    await expect(settleWithin(Promise.resolve(1), 50)).resolves.toBe(1);
    await expect(settleWithin(Promise.reject(new Error("rpc down")), 50)).resolves.toBeNull();
    await expect(settleWithin(new Promise(() => {}), 10)).resolves.toBeNull();
  });
});

describe("ogAlt", () => {
  it("has alt text for every page in both languages", () => {
    for (const page of ["home", "app", "wallet", "guard", "how"] as const) {
      expect(ogAlt(page, "en").length).toBeGreaterThan(20);
      expect(ogAlt(page, "tr")).not.toBe(ogAlt(page, "en"));
    }
  });
});
