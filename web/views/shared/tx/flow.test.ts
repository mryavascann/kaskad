import { describe, expect, it } from "vitest";
import { applyEvent, failFlow, passCheck, startFlow } from "./flow";

const statuses = (s: ReturnType<typeof startFlow>) => s.items.map((i) => `${i.id}:${i.status}`);

describe("transaction flow", () => {
  it("starts with the first step active", () => {
    expect(statuses(startFlow(["send", "check", "confirm"]))).toEqual(["check:active", "send:pending", "confirm:pending"]);
  });

  it("inserts funding only when the sponsor actually funds", () => {
    let s = passCheck(startFlow(["check", "send", "confirm"]));
    expect(statuses(s)).toEqual(["check:done", "send:active", "confirm:pending"]);
    s = applyEvent(s, { step: "funding", detail: "sponsor", raw: "" });
    expect(statuses(s)).toEqual(["check:done", "fund:active", "send:pending", "confirm:pending"]);
    s = applyEvent(s, { step: "sending", detail: "sync", raw: "" });
    s = applyEvent(s, { step: "confirmed", raw: "" });
    expect(statuses(s)).toEqual(["check:done", "fund:done", "send:done", "confirm:done"]);
  });

  it("never shows a step that did not run", () => {
    let s = startFlow(["send", "confirm"]);
    s = applyEvent(s, { step: "sending", detail: "sync", raw: "" });
    s = applyEvent(s, { step: "confirmed", raw: "" });
    expect(s.items.map((i) => i.id)).toEqual(["send", "confirm"]);
  });

  it("marks the running step as failed with its code", () => {
    let s = startFlow(["check", "send", "confirm"]);
    s = failFlow(s, "borrow-paused");
    expect(s.error).toBe("borrow-paused");
    expect(statuses(s)).toEqual(["check:error", "send:pending", "confirm:pending"]);

    let r = passCheck(startFlow(["check", "send", "confirm"]));
    r = applyEvent(r, { step: "failed", detail: "reverted", raw: "" });
    expect(statuses(r)).toEqual(["check:done", "send:error", "confirm:pending"]);
  });

  it("follows a wallet signature and receipt wait", () => {
    let s = startFlow(["prepare", "send", "confirm"]);
    s = applyEvent(s, { step: "signing", detail: "wallet", raw: "" });
    expect(statuses(s)).toEqual(["prepare:done", "sign:active", "send:pending", "confirm:pending"]);
    s = applyEvent(s, { step: "confirming", detail: "receipt", raw: "" });
    expect(statuses(s)).toEqual(["prepare:done", "sign:done", "send:done", "confirm:active"]);
  });
});
