/**
 * Seeded randomness for motion. Anything "random" on screen (seismograph noise, which tile flickers,
 * where a needle is kicked to) draws from a PRNG, so demo mode (`?demo=1`, see `motion/demo.ts`) can
 * replay it frame for frame with `DEMO_SEED`. Not for cryptography.
 */

/** Fixed seed for demo mode and for server-rendered noise that must match on the client. ("KASK") */
export const DEMO_SEED = 0x4b41534b;

/** A random source returning floats in [0, 1), like `Math.random`. */
export type Rng = () => number;

/** mulberry32: a tiny, fast 32-bit PRNG. Same seed, same sequence, on every engine. */
export function mulberry32(seed: number): Rng {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export const randomBetween = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

/** One element of `items`, chosen with `rng`. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("pick: cannot pick from an empty list");
  return items[Math.floor(rng() * items.length)];
}

/** A fresh, non-deterministic 32-bit seed (for everything outside demo mode). */
export function randomSeed(): number {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 2 ** 32);
}
