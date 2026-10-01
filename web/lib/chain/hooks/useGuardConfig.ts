"use client";

import { useEffect, useState } from "react";
import { engineFor } from "../engine-model";
import { onIdle } from "../idle";
import { guardGasFromPreview, guardVerdict, readGuardConfig, type GuardConfig, type GuardVerdict } from "../guard";
import type { Result } from "../types";

type GuardInfo = {
  config: GuardConfig;
  /** refresh() gas limit, sized like the legacy panel (GuardPanel.tsx:87-100). */
  gasLimit: bigint;
  /** Preview of the Guard's scenario on the Guard's own engine. */
  preview: Result;
  /** Would refresh() pause market B right now (Guard.sol:58-60 on that preview). */
  verdict: GuardVerdict;
};

/**
 * Reads the Guard once: scenario, thresholds, safe LTV, engine (1 batched request), then previews the
 * scenario (1 eth_call; a 2nd one on the Guard's engine when it differs from engineFor()).
 * Replaces the legacy hard-coded "eşik %0,5" / "%70" copy. Starts once the browser is idle after the
 * first paint: the reads load viem (read client, ABI coder), which would otherwise run in hydration.
 */
export function useGuardConfig() {
  const [info, setInfo] = useState<GuardInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const cancel = onIdle(async () => {
      try {
        const config = await readGuardConfig();
        const { previewScenario } = await import("../engine");
        const sized = await previewScenario(config.scenario);
        const own =
          config.engine.toLowerCase() === engineFor(config.scenario.assetId).toLowerCase()
            ? sized
            : await previewScenario(config.scenario, { engine: config.engine });
        if (live) setInfo({ config, gasLimit: guardGasFromPreview(sized), preview: own, verdict: guardVerdict(own, config) });
      } catch (e) {
        if (live) setError(String((e as Error)?.message ?? e));
      }
    });
    return () => {
      live = false;
      cancel();
    };
  }, []);

  return { info, error, loading: info === null && error === null };
}
