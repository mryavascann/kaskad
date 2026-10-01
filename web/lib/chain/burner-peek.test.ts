import { describe, expect, it } from "vitest";
import { BURNER_ADDRESS_KEY, BURNER_KEY, peekBurner, rememberBurnerAddress } from "./burner-peek";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const KEY_A = `0x${"1".repeat(64)}`;
const KEY_B = `0x${"2".repeat(64)}`;
const ADDR = "0x1111111111111111111111111111111111111111";

describe("peekBurner", () => {
  it("says none when no valid key is stored (getBurner would generate one)", () => {
    const s = mem();
    expect(peekBurner(s)).toEqual({ kind: "none" });
    s.setItem(BURNER_KEY, "0x1234");
    expect(peekBurner(s)).toEqual({ kind: "none" });
  });

  it("says unknown for a key without a remembered address, and on unreadable storage", () => {
    const s = mem();
    s.setItem(BURNER_KEY, KEY_A);
    expect(peekBurner(s)).toEqual({ kind: "unknown" });
    expect(peekBurner(null)).toEqual({ kind: "unknown" });
    expect(peekBurner({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} })).toEqual({ kind: "unknown" });
  });

  it("returns the remembered address only for the key it was remembered with", () => {
    const s = mem();
    s.setItem(BURNER_KEY, KEY_A);
    rememberBurnerAddress(ADDR, s);
    expect(peekBurner(s)).toEqual({ kind: "known", address: ADDR });
    expect(s.m.get(BURNER_ADDRESS_KEY)).not.toContain("1111111111111111111111111111111111111111111111111111111111111111");
    s.setItem(BURNER_KEY, KEY_B);
    expect(peekBurner(s)).toEqual({ kind: "unknown" });
  });

  it("ignores a malformed remembered entry", () => {
    const s = mem();
    s.setItem(BURNER_KEY, KEY_A);
    s.setItem(BURNER_ADDRESS_KEY, "{not json");
    expect(peekBurner(s)).toEqual({ kind: "unknown" });
  });
});
