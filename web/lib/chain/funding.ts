import { SPONSOR_GRANT_WEI, SPONSOR_TARGET_WEI, SPONSOR_TOP_UPS } from "./api-policy";

type Funding = {
  balance(): Promise<bigint>;
  topUp(): Promise<{ amount?: unknown }>;
  waiting(): void;
  sleep(ms: number): Promise<void>;
};

/** Confirm each capped grant before requesting another. Never retry an ambiguous payment. */
export async function fundToTarget(need: bigint, io: Funding): Promise<void> {
  let balance = await io.balance();
  if (balance >= need) return;
  if (need > SPONSOR_TARGET_WEI) throw new Error("fonlama başarısız: işlem limiti aşıldı");
  io.waiting();
  for (let attempt = 0; attempt < SPONSOR_TOP_UPS; attempt++) {
    const { amount } = await io.topUp();
    if (typeof amount !== "string" || !/^\d{1,19}$/.test(amount) || BigInt(amount) > SPONSOR_GRANT_WEI)
      throw new Error("fonlama başarısız");
    const expected = BigInt(amount) === 0n ? need : balance + BigInt(amount);
    const target = expected < need ? expected : need;
    let confirmed = false;
    for (let poll = 0; poll < 50; poll++) {
      await io.sleep(400);
      balance = await io.balance();
      if (balance >= target) { confirmed = true; break; }
    }
    if (!confirmed) throw new Error("fonlama zaman aşımı");
    if (balance >= need) { await io.sleep(1_000); return; }
  }
  throw new Error("fonlama başarısız: ödeme limiti aşıldı");
}
