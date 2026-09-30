"use client";

import { useEffect, useState } from "react";
import { canClassify, classifyPositions, readBookCached, type Classification } from "../book";
import type { Result, Scenario } from "../types";

/**
 * Per-position tiles for any real-book run: reads the book once per session (cached) and classifies
 * it against `result`, which must be the preview of `scenario` (use usePreview().resultScenario).
 * null while loading, or when the run cannot be classified (calibrated / too large). The scenario is
 * compared by value, so passing a fresh object each render is fine.
 */
export function usePositionMap(scenario: Scenario | null, result: Result | null) {
  const key = scenario !== null && result !== null && canClassify(scenario) ? JSON.stringify(scenario) : null;
  const [state, setState] = useState<{ key: string; result: Result; classification: Classification } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (key === null || result === null) return;
    const s = JSON.parse(key) as Scenario;
    let live = true;
    readBookCached(s.assetId, s.maxPositions)
      .then((book) => {
        if (live) setState({ key, result, classification: classifyPositions(book, result, s) });
      })
      .catch((e) => {
        if (live) setError({ key, message: String((e as Error)?.message ?? e) });
      });
    return () => {
      live = false;
    };
  }, [key, result]);

  const eligible = key !== null;
  const classification = eligible && state?.key === key && state.result === result ? state.classification : null;
  const failed = eligible && error?.key === key ? error.message : null;
  return { classification, eligible, error: failed, loading: eligible && classification === null && failed === null };
}
