import { describe, expect, it, vi } from "vitest";
import { fundToTarget } from "./funding";
import { SPONSOR_GRANT_WEI as MON } from "./api-policy";

function fixture(initial = 0n) {
  let balance = initial;
  const io = {
    balance: vi.fn(async () => balance),
    waiting: vi.fn(), sleep: vi.fn(async () => {}),
    topUp: vi.fn(async () => { balance += MON; return { amount: MON.toString() }; }),
  };
  return io;
}
describe("capped sponsor top-ups", () => {
  it("skips the sponsor for an already funded account, even above the sponsor target cap", async () => {
    const io = fixture(6n * MON);
    await fundToTarget(5n * MON, io);
    expect(io.topUp).not.toHaveBeenCalled(); expect(io.waiting).not.toHaveBeenCalled();
  });
  it("funds a 30M-gas proof in bounded confirmed installments", async () => {
    const io = fixture();
    await fundToTarget(45n * MON / 10n, io);
    expect(io.topUp).toHaveBeenCalledTimes(5);
    expect(io.balance).toHaveBeenCalledTimes(6);
    expect(io.sleep).toHaveBeenLastCalledWith(1_000);
  });
  it("rejects oversized needs before asking for a grant", async () => {
    const io = fixture();
    await expect(fundToTarget(5n * MON, io)).rejects.toThrow("işlem limiti");
    expect(io.topUp).not.toHaveBeenCalled();
  });
  it("does not repeat a grant with an ambiguous result or unseen balance", async () => {
    const io = fixture();
    io.topUp.mockResolvedValue({ amount: MON.toString() });
    await expect(fundToTarget(2n * MON, io)).rejects.toThrow("zaman aşımı");
    expect(io.topUp).toHaveBeenCalledOnce();
    io.topUp.mockRejectedValue(new Error("network timeout"));
    await expect(fundToTarget(2n * MON, io)).rejects.toThrow("network timeout");
    expect(io.topUp).toHaveBeenCalledTimes(2);
  });
  it("waits for the full need when the server reports already funded", async () => {
    const io = fixture();
    io.topUp.mockResolvedValue({ amount: "0" });
    io.balance.mockResolvedValueOnce(0n).mockResolvedValue(MON);
    await fundToTarget(MON, io);
    expect(io.topUp).toHaveBeenCalledOnce();
  });
  it("rejects malformed grants and caps repeated small payments", async () => {
    for (const amount of ["-1", "bad", (MON + 1n).toString()]) {
      const io = fixture(); io.topUp.mockResolvedValue({ amount });
      await expect(fundToTarget(MON, io)).rejects.toThrow("fonlama başarısız");
      expect(io.topUp).toHaveBeenCalledOnce();
    }
    const io = fixture(); let n = 0n;
    io.topUp.mockImplementation(async () => { n++; return { amount: "1" }; });
    io.balance.mockImplementation(async () => n);
    await expect(fundToTarget(MON, io)).rejects.toThrow("ödeme limiti");
    expect(io.topUp).toHaveBeenCalledTimes(5);
  });
});
