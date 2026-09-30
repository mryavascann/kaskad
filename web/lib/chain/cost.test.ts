import { describe, expect, it, vi } from "vitest";
import { fmtNum } from "@/lib/kaskad/format";
import { monCost } from "@/lib/kaskad/math";
import { CONFIRM_THRESHOLD_MON, MIN_DISPLAY_MON, decideCost, needsConfirm, payerFor, quoteCost, type CostQuote } from "./cost";
import { SPONSOR_LOW_WEI, fetchSponsor, isSponsorLow } from "./sponsor";

/** app/_components/CostTag.tsx:9-12 verbatim. */
function legacyFmtMon(gasLimit: bigint): string {
  const m = monCost(gasLimit);
  return m < 0.01 ? "<0,01 MON" : `~${fmtNum(m, m < 1 ? 2 : 2)} MON`;
}
const renderTr = (q: CostQuote) => (q.belowMinDisplay ? "<0,01 MON" : `~${fmtNum(q.mon, 2)} MON`);

describe("cost quote", () => {
  it("carries everything the legacy tag rendered", () => {
    for (const g of [21_000n, 80_000n, 98_039n, 1_597_536n, 9_803_921n, 9_803_922n, 30_000_000n]) {
      expect(renderTr(quoteCost(g, "burner"))).toBe(legacyFmtMon(g));
    }
    expect(quoteCost(80_000n, "burner")).toEqual({ gasLimit: 80_000n, mon: monCost(80_000n), belowMinDisplay: true, heavy: false, payer: "sponsor" });
    expect(quoteCost(30_000_000n, "mera")).toMatchObject({ heavy: true, payer: "wallet" });
    expect(payerFor("injected")).toBe("wallet");
    expect([MIN_DISPLAY_MON, CONFIRM_THRESHOLD_MON]).toEqual([0.01, 1]);
  });

  it("the >= 1 MON rule (CostTag.tsx:30-32): 102 gwei x limit", () => {
    expect(needsConfirm(9_803_921n)).toBe(false); // 0.99999994 MON
    expect(needsConfirm(9_803_922n)).toBe(true); // 1.00000004 MON
  });

  it("decideCost: the confirmation UI is injected; heavy txs without it are refused", async () => {
    const confirm = vi.fn(async (q: CostQuote) => q.payer === "sponsor");
    expect(await decideCost(80_000n, "burner", confirm)).toBe("not-needed");
    expect(confirm).not.toHaveBeenCalled();
    expect(await decideCost(30_000_000n, "burner", confirm)).toBe("approved");
    expect(confirm).toHaveBeenCalledWith(quoteCost(30_000_000n, "burner"));
    expect(await decideCost(30_000_000n, "injected", confirm)).toBe("declined");
    expect(await decideCost(30_000_000n, "burner")).toBe("confirm-required");
  });
});

describe("sponsor (GET /api/fund)", () => {
  it("parses wei strings, returns null on failure (Connect.tsx:75-78)", async () => {
    const body = { address: "0x0000000000000000000000000000000000000001", balanceWei: "15000000000000000000", spendableWei: "5000000000000000000", reserveWei: "10000000000000000000" };
    const ok = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    expect(await fetchSponsor(ok)).toEqual({ address: body.address, balanceWei: 15n * 10n ** 18n, spendableWei: 5n * 10n ** 18n, reserveWei: 10n * 10n ** 18n });
    expect(ok).toHaveBeenCalledWith("/api/fund");
    expect(await fetchSponsor(async () => new Response("{}", { status: 503 }))).toBeNull();
    expect(
      await fetchSponsor(async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
  });

  it("low budget below 3 MON (Connect.tsx:103)", () => {
    expect(isSponsorLow(null)).toBe(false);
    expect(isSponsorLow(SPONSOR_LOW_WEI - 1n)).toBe(true);
    expect(isSponsorLow(SPONSOR_LOW_WEI)).toBe(false);
  });
});
