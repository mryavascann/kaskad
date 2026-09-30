// Gas limits of the proof txs, sized from the free preview. Pure (no viem), so the cost line can
// render before the action modules load; proveScenario.ts / proveMonteCarlo.ts re-export them.

import { monteCarloGasLimit, simulateGasLimit } from "@/lib/kaskad/math";
import type { MonteCarloResult, Result } from "../types";

/** simulate() gas limit from the preview (Protocol.tsx:245). Monad charges the limit. */
export const proveScenarioGasLimit = (preview: Pick<Result, "gasUsed" | "rounds">): bigint =>
  simulateGasLimit(preview.gasUsed, preview.rounds);

/** simulateMC gas limit from the preview (MonteCarlo.tsx:105). */
export const proveMonteCarloGasLimit = (preview: Pick<MonteCarloResult, "gasUsed">): bigint => monteCarloGasLimit(preview.gasUsed);
