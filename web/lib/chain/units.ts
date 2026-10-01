// viem-free copies of the two viem utils the first screens need, so their pages do not load viem
// before the first paint. Same results as viem's (tests compare them).

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** viem `isAddress(a, { strict: false })`: 0x + 40 hex digits, any case, checksum not checked. */
export const isAddressLoose = (address: string): boolean => ADDRESS_RE.test(address);

/** viem `formatEther(wei)` (ox Value.format with 18 decimals): exact decimal string, no trailing zeros. */
export function formatEther(wei: bigint): string {
  const decimals = 18;
  let display = wei.toString();
  const negative = display.startsWith("-");
  if (negative) display = display.slice(1);
  display = display.padStart(decimals, "0");
  const integer = display.slice(0, display.length - decimals);
  const fraction = display.slice(display.length - decimals).replace(/(0+)$/, "");
  return `${negative ? "-" : ""}${integer || "0"}${fraction ? `.${fraction}` : ""}`;
}
