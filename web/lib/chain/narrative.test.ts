import { describe, expect, it } from "vitest";
import { DEPLOYMENT, type AssetInfo } from "@/lib/kaskad/config";
import { fmtNum, fmtPct, fmtUsd, wadToNum } from "@/lib/kaskad/format";
import { RECOVERY_BPS } from "@/lib/kaskad/recovery";
import { FIXTURE_RUNS, fixtureRun } from "./__fixtures__/load";
import { narrativeFacts, type NarrativeFacts } from "./narrative";
import { BASE_SETTINGS, symbol } from "./scenario";
import { cascadeTimeline } from "./timeline";
import type { Result, Settings } from "./types";

/** app/_components/Protocol.tsx:114-143 verbatim (the oracle the facts must reproduce). */
const sym = (a: AssetInfo) => a.symbol.replace("-8OCT2026", "");
const usd = (w: bigint, scale = 1) => fmtUsd(wadToNum(w) * scale);
function narrate(r: Result, a: AssetInfo, s: Settings, scale: number): string {
  const rec = RECOVERY_BPS[a.id]?.bps ?? 0;
  const name = sym(a);
  const p0 = wadToNum(r.startPrice);
  const pf = wadToNum(r.finalPrice);
  const drop = 1 - pf / p0;
  if (r.liquidations === 0)
    return `${name} ${s.steps} blokta %${fmtNum(s.shockPct, 1)} düşse de hiçbir pozisyon likidasyon eşiğine inmiyor. Protokol bu şoku kayıpsız atlatıyor.`;
  let t = `${name} ${s.steps} blokta %${fmtNum(s.shockPct, 1)} düşünce ${fmtNum(r.liquidations)} likidasyon başlıyor: likidatörler borcu ödeyip el koydukları teminatı ${fmtUsd(a.depthUsd)} derinliğindeki havuzda satıyor. `;
  t +=
    s.feedback > 0
      ? `Oracle zincir üstü havuz fiyatını izlediği için her satış fiyatı daha da düşürüyor ve yeni likidasyonlar tetikliyor: fiyat $${p0.toFixed(3)} → $${pf.toFixed(3)} (−${fmtPct(drop, 0)}). `
      : `Oracle dış fiyatı (Chainlink / kur) izlediği için satışlar oracle'ı düşürmüyor, sarmal oluşmuyor. ${
          rec >= 5_000
            ? "Arbitrajcılar havuzu her blokta dış fiyata geri çektiği için likidatörler satmaya devam edebiliyor. "
            : "Ama havuzu dışarıdan dolduran arbitraj yok denecek kadar az: likidatör bir noktadan sonra zarar edeceği için satmayı bırakıyor. "
        }`;
  const bad = wadToNum(r.badDebt) * scale;
  const stuck = wadToNum(r.stuckDebt) * scale;
  t +=
    bad > 0
      ? `Sonuç: ${usd(r.totalDebt, scale)} borcun ${fmtUsd(bad)}'ı karşılıksız kalıyor. Bu parayı protokol, yani mevduat sahipleri öder.`
      : `Sonuç: karşılıksız borç yok.`;
  if (stuck > 0) t += ` Ama ${fmtUsd(stuck)} borç likide edilemeden bekliyor; fiyat biraz daha düşerse o da karşılıksız kalır.`;
  return t;
}

/** A Turkish renderer of the facts: if it reproduces narrate(), the facts lost nothing. */
function renderTr(f: NarrativeFacts): string {
  if (f.kind === "no-liquidations")
    return `${f.symbol} ${f.steps} blokta %${fmtNum(f.shockPct, 1)} düşse de hiçbir pozisyon likidasyon eşiğine inmiyor. Protokol bu şoku kayıpsız atlatıyor.`;
  let t = `${f.symbol} ${f.steps} blokta %${fmtNum(f.shockPct, 1)} düşünce ${fmtNum(f.liquidations)} likidasyon başlıyor: likidatörler borcu ödeyip el koydukları teminatı ${fmtUsd(f.depthUsd)} derinliğindeki havuzda satıyor. `;
  t +=
    f.oracle.kind === "spiral"
      ? `Oracle zincir üstü havuz fiyatını izlediği için her satış fiyatı daha da düşürüyor ve yeni likidasyonlar tetikliyor: fiyat $${f.oracle.startPrice.toFixed(3)} → $${f.oracle.finalPrice.toFixed(3)} (−${fmtPct(f.oracle.drop, 0)}). `
      : `Oracle dış fiyatı (Chainlink / kur) izlediği için satışlar oracle'ı düşürmüyor, sarmal oluşmuyor. ${
          f.oracle.arbitrage === "recovers"
            ? "Arbitrajcılar havuzu her blokta dış fiyata geri çektiği için likidatörler satmaya devam edebiliyor. "
            : "Ama havuzu dışarıdan dolduran arbitraj yok denecek kadar az: likidatör bir noktadan sonra zarar edeceği için satmayı bırakıyor. "
        }`;
  t +=
    f.outcome.badDebtUsd > 0
      ? `Sonuç: ${fmtUsd(f.outcome.totalDebtUsd)} borcun ${fmtUsd(f.outcome.badDebtUsd)}'ı karşılıksız kalıyor. Bu parayı protokol, yani mevduat sahipleri öder.`
      : `Sonuç: karşılıksız borç yok.`;
  if (f.stuck) t += ` Ama ${fmtUsd(f.stuck.stuckDebtUsd)} borç likide edilemeden bekliyor; fiyat biraz daha düşerse o da karşılıksız kalır.`;
  return t;
}

const settingsFor = (assetId: number, shockBps: number, feedback: number): Settings => ({
  ...BASE_SETTINGS,
  assetId,
  shockPct: shockBps / 100,
  feedback,
});

describe("narrativeFacts", () => {
  it("reproduces narrate() on every recorded run (all oracle / outcome branches)", () => {
    for (const run of FIXTURE_RUNS) {
      const a = DEPLOYMENT.assets[run.scenario.assetId];
      const st = settingsFor(run.scenario.assetId, run.scenario.shockBps, run.scenario.oracleFeedbackBps);
      for (const scale of [1, 2.5]) expect(renderTr(narrativeFacts(run.result, a, st, scale))).toBe(narrate(run.result, a, st, scale));
    }
  });

  it("covers the branches with the expected kinds", () => {
    const a9 = DEPLOYMENT.assets[9];
    const a14 = DEPLOYMENT.assets[14];
    const sali = narrativeFacts(fixtureRun("sali").result, a9, settingsFor(9, 300, 0), 1);
    expect(sali).toMatchObject({ kind: "cascade", liquidations: 1, oracle: { kind: "external", arbitrage: "thin", recoveryBps: 0 }, outcome: { badDebtUsd: 0 } });
    if (sali.kind !== "cascade") throw new Error("unreachable");
    expect(sali.stuck?.stuckDebtUsd).toBeCloseTo(110_987_638.08, 1);

    const worst = narrativeFacts(fixtureRun("worst").result, a9, settingsFor(9, 300, 10_000), 1);
    expect(worst).toMatchObject({ kind: "cascade", oracle: { kind: "spiral" }, stuck: null });
    if (worst.kind !== "cascade" || worst.oracle.kind !== "spiral") throw new Error("unreachable");
    expect(worst.outcome.badDebtUsd).toBeGreaterThan(0);
    expect(worst.oracle.drop).toBeCloseTo(1 - worst.oracle.finalPrice / worst.oracle.startPrice, 12);

    const usde = narrativeFacts(fixtureRun("usde-eth-5-external").result, a14, settingsFor(14, 500, 0), 1);
    expect(usde).toMatchObject({ kind: "cascade", oracle: { kind: "external", arbitrage: "recovers", recoveryBps: 5_000 } });

    const calm = { ...fixtureRun("sali").result, liquidations: 0, log: [] };
    expect(narrativeFacts(calm, a9, settingsFor(9, 30, 0), 1)).toEqual({ kind: "no-liquidations", symbol: "syrupUSDC", steps: 20, shockPct: 0.3 });
    expect(renderTr(narrativeFacts(calm, a9, settingsFor(9, 30, 0), 1))).toBe(narrate(calm, a9, settingsFor(9, 30, 0), 1));
  });

  it("uses the legacy display symbol", () => {
    const a12 = DEPLOYMENT.assets[12];
    const f = narrativeFacts({ ...fixtureRun("sali").result, liquidations: 0 }, a12, settingsFor(12, 100, 0), 1);
    expect(f.symbol).toBe(symbol(a12));
    expect(f.symbol).toBe("PT-AUSD");
  });
});

describe("cascadeTimeline", () => {
  it("flags the stalled finding run (DominoCascade.tsx:19)", () => {
    const run = fixtureRun("sali");
    const t = cascadeTimeline(run.result, run.scenario);
    expect(t.points).toHaveLength(21);
    expect(t).toMatchObject({ activeBlocks: 1, lastActiveStep: 7, stalled: true });
    expect(t.points[7].liquidated).toBeCloseTo(133_890.84, 1);
  });

  it("is not stalled when nothing is stuck", () => {
    const run = fixtureRun("worst");
    const t = cascadeTimeline(run.result, run.scenario);
    expect(run.result.stuckDebt).toBe(0n);
    expect(t.stalled).toBe(false);
  });
});
