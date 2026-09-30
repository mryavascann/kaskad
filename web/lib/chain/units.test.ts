import { formatEther as viemFormatEther, isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { formatEther, isAddressLoose } from "./units";

describe("units (viem-free copies)", () => {
  it("formatEther matches viem", () => {
    for (const v of [0n, 1n, 10n ** 18n, 123_456_789_000_000_000n, -5n * 10n ** 17n, 10n ** 30n + 7n, 999_999_999_999_999_999n]) {
      expect(formatEther(v)).toBe(viemFormatEther(v));
    }
  });
  it("isAddressLoose matches viem non-strict isAddress", () => {
    for (const a of [
      "0x815f5BB257e88b67216a344C7C83a3eA4EE74748",
      "0x815f5bb257e88b67216a344c7c83a3ea4ee74748",
      "0x815F5BB257E88B67216A344C7C83A3EA4EE74748",
      "0x815f5BB257e88b67216a344C7C83a3eA4EE7474",
      "815f5BB257e88b67216a344C7C83a3eA4EE74748",
      "0xZZ5f5BB257e88b67216a344C7C83a3eA4EE74748",
      "",
    ]) {
      expect(isAddressLoose(a)).toBe(isAddress(a, { strict: false }));
    }
  });
});
