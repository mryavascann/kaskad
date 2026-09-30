// Chart inputs computed from the recorded fixtures, shared by the viz tests and the /design demos.
// Nothing here is typed in by hand: every number comes from a recorded on-chain preview (or the
// exact bigint replay of one, via classifyPositions).
import { FIXTURE_BLOCKS, fixtureRun, type FixtureRun } from "@/lib/chain/__fixtures__/load";
import { classifyPositions } from "@/lib/chain/book";
import { cascadeTimeline } from "@/lib/chain/timeline";
import type { PositionsInput } from "../position-tiles";
import type { VizPosition } from "../positions";
import type { TimelineInput } from "../timeline-model";

export type FixtureName = "sali" | "worst" | "usde-eth-5-external" | "usde-eth-5-pool";

export type VizRun = {
  name: FixtureName;
  run: FixtureRun;
  /** Monad testnet block the preview was recorded at. */
  block: number;
  timeline: TimelineInput;
  /** Oracle price per block. */
  prices: number[];
  steps: number;
  /** Scenario shock as a fraction. */
  shock: number;
  positions: PositionsInput;
};

/** The chart fields of a classified position (keeps client payloads small). */
export const slimPosition = (p: VizPosition): VizPosition => ({
  index: p.index,
  outcome: p.outcome,
  debtUsd: p.debtUsd,
  healthFactor: p.healthFactor,
  liquidationPrice: p.liquidationPrice,
  thresholdDrop: p.thresholdDrop,
  firstLiquidationStep: p.firstLiquidationStep,
  finalHealthFactor: p.finalHealthFactor,
});

export function vizRun(name: FixtureName): VizRun {
  const run = fixtureRun(name);
  const t = cascadeTimeline(run.result, run.scenario);
  const c = classifyPositions(run.book, run.result, run.scenario);
  return {
    name,
    run,
    block: Number(BigInt(run.scenario.assetId === 9 ? FIXTURE_BLOCKS.book9 : FIXTURE_BLOCKS.book14)),
    timeline: { points: t.points, stalled: t.stalled, lastActiveStep: t.lastActiveStep },
    prices: t.points.map((p) => p.price),
    steps: run.scenario.steps,
    shock: run.scenario.shockBps / 10_000,
    positions: c.consistent ? { consistent: true, positions: c.positions.map(slimPosition) } : c,
  };
}

/** Positions of a run (throws if the replay did not match: fixtures always match). */
export function positionsOf(r: VizRun): readonly VizPosition[] {
  if (!r.positions.consistent) throw new Error(`fixture ${r.name} did not classify`);
  return r.positions.positions;
}
