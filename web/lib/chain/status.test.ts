import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FUND_ROUTE_ERRORS, SIGNER_ERRORS, SIGNER_STATUS, connectError, fundingFailure, toTxEvent, txError } from "./status";

const src = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8");

describe("status strings stay in sync with the chain layer", () => {
  it("every mapped string exists verbatim where it is produced", () => {
    const layer = src("lib/kaskad/burner.ts") + src("lib/kaskad/signer.ts");
    for (const s of Object.values(SIGNER_STATUS)) expect(layer).toContain(`"${s}"`);
    for (const s of Object.values(SIGNER_ERRORS)) expect(layer).toContain(s);
    const fund = src("app/api/fund/route.ts");
    for (const s of Object.values(FUND_ROUTE_ERRORS)) expect(fund).toContain(`"${s}"`);
  });
});

describe("toTxEvent", () => {
  it("maps sendTx's onStatus strings to typed steps, keeping raw", () => {
    expect(toTxEvent(SIGNER_STATUS.funding)).toEqual({ step: "funding", detail: "sponsor", raw: SIGNER_STATUS.funding });
    expect(toTxEvent(SIGNER_STATUS.burnerSending)).toMatchObject({ step: "sending", detail: "sync" });
    expect(toTxEvent(SIGNER_STATUS.meraSigning)).toMatchObject({ step: "signing", detail: "mera" });
    expect(toTxEvent(SIGNER_STATUS.walletConfirm)).toMatchObject({ step: "signing", detail: "wallet" });
    expect(toTxEvent(SIGNER_STATUS.awaitingReceipt)).toMatchObject({ step: "confirming", detail: "receipt" });
    expect(toTxEvent("something new")).toEqual({ step: "unknown", raw: "something new" });
  });
});

describe("txError", () => {
  it("BorrowIsPaused revert (GuardPanel.tsx:159)", () => {
    const e = new Error('The contract function "borrow" reverted.\n\nError: BorrowIsPaused()');
    expect(txError(e)).toEqual({ code: "borrow-paused", raw: e.message });
  });

  it("user rejection anywhere in the cause chain, or no account selected", () => {
    const inner = Object.assign(new Error("User rejected the request."), { code: 4001 });
    const outer = Object.assign(new Error("Transaction failed"), { cause: inner });
    expect(txError(outer).code).toBe("rejected");
    expect(txError(new Error(SIGNER_ERRORS.noAccount)).code).toBe("rejected");
  });

  it("signer errors", () => {
    expect(txError(new Error("Bakiye yetersiz: 0.100 MON var, bu işlem için 4.500 MON gerekli (testnet faucet: faucet.monad.xyz).")).code).toBe("insufficient-balance");
    expect(txError(new Error(SIGNER_ERRORS.noWallet)).code).toBe("no-wallet");
    expect(txError(new Error(SIGNER_ERRORS.meraLocked)).code).toBe("mera-locked");
  });

  it("funding failures, by message or by phase", () => {
    expect(txError(new Error(FUND_ROUTE_ERRORS.sponsorEmpty))).toEqual({ code: "funding-failed", detail: "sponsor-empty", raw: FUND_ROUTE_ERRORS.sponsorEmpty });
    expect(txError(new Error(FUND_ROUTE_ERRORS.rateLimited))).toMatchObject({ code: "funding-failed", detail: "rate-limited" });
    expect(txError(new Error("fonlama zaman aşımı"))).toMatchObject({ detail: "timeout" });
    expect(txError(new Error("fonlama başarısız (500)"))).toMatchObject({ detail: "failed" });
    expect(txError(new Error("socket hang up"), "funding")).toMatchObject({ code: "funding-failed", detail: "failed" });
    expect(txError(new Error("socket hang up"), "sending").code).toBe("unknown");
    expect(fundingFailure("anything else")).toBeNull();
  });

  it("out of gas, RPC rate limit, unknown", () => {
    expect(txError(new Error("intrinsic gas too low")).code).toBe("out-of-gas");
    expect(txError(new Error("HTTP request failed.\n\nStatus: 429\nURL: /api/rpc")).code).toBe("rate-limited");
    expect(txError("weird")).toEqual({ code: "unknown", raw: "weird" });
  });
});

describe("connectError", () => {
  it("maps wallet and passkey failures", () => {
    expect(connectError(new Error(SIGNER_ERRORS.noWallet)).code).toBe("no-wallet");
    expect(connectError(Object.assign(new Error("The operation either timed out or was not allowed."), { name: "NotAllowedError" })).code).toBe("rejected");
    expect(connectError(Object.assign(new Error("x"), { code: 4001 })).code).toBe("rejected");
    expect(connectError(new Error("chain add failed"))).toEqual({ code: "failed", raw: "chain add failed" });
  });
});
