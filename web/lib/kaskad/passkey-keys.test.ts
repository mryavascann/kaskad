import { describe, expect, it } from "vitest";
import { derivePasskeyKeys, fromBase64Url, open, seal, toBase64Url } from "./passkey-keys";

const prf = (fill: number) => new Uint8Array(32).fill(fill);

describe("passkey keys: one PRF output, many keys", () => {
  it("derives the same id and write token from the same passkey, and different ones from another", async () => {
    const a1 = await derivePasskeyKeys(prf(7));
    const a2 = await derivePasskeyKeys(prf(7));
    const b = await derivePasskeyKeys(prf(8));
    expect(a1.id).toMatch(/^[0-9a-f]{64}$/);
    expect(a1.writeToken).toMatch(/^[0-9a-f]{64}$/);
    expect([a2.id, a2.writeToken]).toEqual([a1.id, a1.writeToken]);
    expect(b.id).not.toBe(a1.id);
    // Separate labels: the id handed to the server says nothing about the write token.
    expect(a1.id).not.toBe(a1.writeToken);
  });

  it("keeps the encryption key inside Web Crypto and leaves the caller's PRF bytes untouched", async () => {
    const input = prf(9);
    const keys = await derivePasskeyKeys(input);
    expect(keys.encrypt.extractable).toBe(false);
    expect(keys.encrypt.usages.sort()).toEqual(["decrypt", "encrypt"]);
    expect(input.every((x) => x === 9)).toBe(true);
    await expect(derivePasskeyKeys(new Uint8Array(31))).rejects.toThrow(/32 bytes/);
  });

  it("seals and opens a watchlist; another passkey or a tampered blob cannot open it", async () => {
    const mine = await derivePasskeyKeys(prf(1));
    const other = await derivePasskeyKeys(prf(2));
    const value = { v: 1, entries: [{ address: "0x815f5BB257e88b67216a344C7C83a3eA4EE74748", alertDropPct: 5 }] };
    const blob = await seal(mine.encrypt, value);
    expect(blob.v).toBe(1);
    expect(JSON.stringify(blob)).not.toContain("815f5BB2"); // the address never leaves in the clear
    expect(await open(mine.encrypt, blob)).toEqual(value);
    await expect(open(other.encrypt, blob)).rejects.toThrow();
    const ct = fromBase64Url(blob.ct);
    ct[0] ^= 1;
    await expect(open(mine.encrypt, { ...blob, ct: toBase64Url(ct) })).rejects.toThrow();
    // A fresh nonce per seal: the same list never produces the same ciphertext twice.
    expect((await seal(mine.encrypt, value)).ct).not.toBe(blob.ct);
  });
});
