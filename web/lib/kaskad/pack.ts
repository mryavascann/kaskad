// Mirrors contracts/src/PositionBook.sol PositionLib: one position per 32-byte slot.
// bits   0..87   collateral     uint88  1e6 token units
// bits  88..175  debt           uint88  1e6 USD
// bits 176..207  otherColl      uint32  whole USD
// bits 208..215  collateralId   uint8
// bits 216..231  ltBps          uint16
// bits 232..247  bonusBps       uint16
// bits 248..255  eMode          uint8

export type PackedPosition = {
  collateral: bigint; // 1e6 token units
  debt: bigint; // 1e6 USD
  otherColl: number; // whole USD
  collateralId: number;
  ltBps: number;
  bonusBps: number;
  eMode: number;
};

const MAX88 = (1n << 88n) - 1n;

function checkUint(name: string, v: number, bits: number) {
  if (!Number.isInteger(v) || v < 0 || v >= 2 ** bits) throw new RangeError(`${name} out of range: ${v}`);
}

export function packPosition(p: PackedPosition): bigint {
  if (p.collateral < 0n || p.collateral > MAX88) throw new RangeError(`collateral out of range: ${p.collateral}`);
  if (p.debt < 0n || p.debt > MAX88) throw new RangeError(`debt out of range: ${p.debt}`);
  checkUint("otherColl", p.otherColl, 32);
  checkUint("collateralId", p.collateralId, 8);
  checkUint("ltBps", p.ltBps, 16);
  checkUint("bonusBps", p.bonusBps, 16);
  checkUint("eMode", p.eMode, 8);
  return (
    p.collateral |
    (p.debt << 88n) |
    (BigInt(p.otherColl) << 176n) |
    (BigInt(p.collateralId) << 208n) |
    (BigInt(p.ltBps) << 216n) |
    (BigInt(p.bonusBps) << 232n) |
    (BigInt(p.eMode) << 248n)
  );
}

export function unpackPosition(w: bigint): PackedPosition {
  return {
    collateral: w & MAX88,
    debt: (w >> 88n) & MAX88,
    otherColl: Number((w >> 176n) & 0xffffffffn),
    collateralId: Number((w >> 208n) & 0xffn),
    ltBps: Number((w >> 216n) & 0xffffn),
    bonusBps: Number((w >> 232n) & 0xffffn),
    eMode: Number((w >> 248n) & 0xffn),
  };
}

/** Raw token amount with `decimals` -> 1e6 units (truncating). */
export function toUnits6(raw: bigint, decimals: number): bigint {
  return decimals >= 6 ? raw / 10n ** BigInt(decimals - 6) : raw * 10n ** BigInt(6 - decimals);
}

/** USD float -> 1e6 USD units. */
export function usdTo6(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6));
}
