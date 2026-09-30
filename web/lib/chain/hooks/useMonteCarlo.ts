"use client";

import { useCallback, useEffect, useState } from "react";
import { findMaxPaths, monteCarloAvailable, monteCarloFacts, previewMonteCarlo } from "../engine";
import type { MonteCarloResult, Scenario } from "../types";

/** Debounce of the Monte Carlo preview (MonteCarlo.tsx:74). */
export const MC_DEBOUNCE_MS = 800;

/**
 * K random paths on the real book, debounced 800 ms with key-derived freshness (MonteCarlo.tsx:68-82),
 * plus the free "find the limit" binary search (MonteCarlo.tsx:84-101, ~11 sequential eth_calls).
 * `fits` is false when the preview returned null (does not fit in 30M gas, or failed).
 */
export function useMonteCarlo(base: Scenario | null, paths: number) {
  const scKey = base ? JSON.stringify(base) : null;
  const key = `${scKey}:${paths}`;
  const [state, setState] = useState<{ key: string; r: MonteCarloResult | null } | null>(null);
  const [limit, setLimit] = useState<{ key: string; k: number; r: MonteCarloResult | null } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (scKey === null) return;
    let live = true;
    const t = setTimeout(() => {
      previewMonteCarlo(JSON.parse(scKey) as Scenario, paths).then((r) => {
        if (live) setState({ key, r });
      });
    }, MC_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, scKey, paths]);

  const findLimit = useCallback(async () => {
    if (scKey === null) return;
    setSearching(true);
    try {
      const { k, result } = await findMaxPaths(JSON.parse(scKey) as Scenario);
      setLimit({ key: scKey, k, r: result });
    } finally {
      setSearching(false);
    }
  }, [scKey]);

  const loading = scKey !== null && state?.key !== key;
  const result = !loading && state ? state.r : null;
  const lim = limit && limit.key === scKey ? limit : null;
  return {
    available: monteCarloAvailable(),
    result,
    facts: result ? monteCarloFacts(result) : null,
    loading,
    /** null while loading; false = this K does not fit in one tx (legacy "reduce K"). */
    fits: loading || scKey === null ? null : result !== null,
    /** Largest K that fits in 30M gas for this scenario, once findLimit() ran. */
    limit: lim ? { k: lim.k, result: lim.r, facts: lim.r ? monteCarloFacts(lim.r) : null } : null,
    searching,
    findLimit,
  };
}
