"use client";

import { useEffect, useMemo, useState } from "react";
import { COMPARE_DEBOUNCE_MS, compareResultFacts, compareRows, compareScenario, type CompareParams } from "../compare";
import { previewScenario } from "../engine";
import type { Result } from "../types";

/**
 * Same shock on every compare row's real book (ComparePanel.tsx:20-54): 900 ms debounce, one
 * JSON-RPC batch of up to 7 previews, a failed row stays null. Rows are data (asset + role code).
 */
export function useCompare(p: CompareParams) {
  const key = `${p.shockBps}:${p.feedback}:${p.steps}:${p.rounds}`;
  const [state, setState] = useState<{ key: string; results: (Result | null)[] } | null>(null);
  const rows = useMemo(() => compareRows(), []);

  useEffect(() => {
    let live = true;
    const [shockBps, feedback, steps, rounds] = key.split(":").map(Number);
    const t = setTimeout(() => {
      Promise.all(
        rows.map((r) => previewScenario(compareScenario(r.assetId, { shockBps, feedback, steps, rounds })).catch(() => null)),
      ).then((results) => {
        if (live) setState({ key, results });
      });
    }, COMPARE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, rows]);

  const results = state?.key === key ? state.results : null;
  return {
    rows: rows.map((row, i) => {
      const result = results?.[i] ?? null;
      return { ...row, result, facts: compareResultFacts(result) };
    }),
    loading: results === null,
  };
}
