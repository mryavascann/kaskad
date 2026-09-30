"use client";

import { useEffect, useState } from "react";
import { previewCurve } from "../engine";
import { CURVE_SHOCKS_BPS, stressCurveScenarios } from "../scenario";
import type { CurveResult } from "../types";

type Curve = { pool: CurveResult; external: CurveResult };

/**
 * Stress curve on the real book, both oracle modes: 2 eth_calls when the asset / path changes
 * (Protocol.tsx:220-241). The legacy loader had no debounce (default 0 here); pass `debounceMs`
 * when steps / rounds come from a slider. Failures leave the curve null (legacy: swallowed).
 */
export function useStressCurve(assetId: number, steps: number, rounds: number, opts: { debounceMs?: number } = {}) {
  const key = `${assetId}:${steps}:${rounds}`;
  const debounceMs = opts.debounceMs ?? 0;
  const [state, setState] = useState<({ key: string } & Curve) | null>(null);

  useEffect(() => {
    let live = true;
    const [id, st, rd] = key.split(":").map(Number);
    const load = () => {
      let sc: ReturnType<typeof stressCurveScenarios>;
      try {
        sc = stressCurveScenarios(id, st, rd);
      } catch {
        return; // unknown asset
      }
      Promise.all([previewCurve(sc.pool, CURVE_SHOCKS_BPS), previewCurve(sc.external, CURVE_SHOCKS_BPS)])
        .then(([pool, external]) => {
          if (live) setState({ key, pool, external });
        })
        .catch(() => {});
    };
    const t = setTimeout(load, debounceMs);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, debounceMs]);

  const curve: Curve | null = state?.key === key ? { pool: state.pool, external: state.external } : null;
  return { shocksBps: CURVE_SHOCKS_BPS, curve, loading: curve === null };
}
