// Per-block view of a cascade result. The engine logs only waves that liquidated something, so a
// stalled cascade (e.g. pool exhausted after block 1) would otherwise show a single bar.

export type BlockPoint = {
  step: number; // 0 = before the shock
  price: number; // oracle price at the start of the block (USD); last block = final price
  liquidated: number; // USD liquidated in this block
  liquidations: number;
  waves: number;
};

type Log = { step: number; round: number; liquidations: number; priceWad: bigint; liquidatedDebt: bigint };
type R = { startPrice: bigint; finalPrice: bigint; log: readonly Log[] };
type S = { steps: number; shockBps: number; oracleFeedbackBps: number };

const toNum = (w: bigint) => Number(w / 10n ** 12n) / 1e6;

export function blockTimeline(r: R, s: S): { points: BlockPoint[]; activeBlocks: number; lastActiveStep: number } {
  const p0 = toNum(r.startPrice);
  const base = (step: number) => p0 * (1 - (s.shockBps * step) / (10_000 * s.steps));
  const points: BlockPoint[] = [{ step: 0, price: p0, liquidated: 0, liquidations: 0, waves: 0 }];
  for (let step = 1; step <= s.steps; step++) {
    const waves = r.log.filter((l) => l.step === step);
    let price: number;
    if (s.oracleFeedbackBps === 0) {
      price = base(step); // oracle sees only the external path: exact
    } else if (waves.length) {
      price = toNum(waves[0].priceWad); // oracle at the first wave of the block
    } else {
      // no wave in this block: carry the pool's displacement forward along the external path
      price = points[step - 1].price * (base(step) / Math.max(1e-18, base(step - 1)));
    }
    points.push({
      step,
      price,
      liquidated: waves.reduce((sum, w) => sum + toNum(w.liquidatedDebt), 0),
      liquidations: waves.reduce((sum, w) => sum + w.liquidations, 0),
      waves: waves.length,
    });
  }
  points[s.steps].price = toNum(r.finalPrice); // exact end state
  const active = points.filter((p) => p.liquidations > 0);
  return { points, activeBlocks: active.length, lastActiveStep: active.length ? active[active.length - 1].step : 0 };
}
