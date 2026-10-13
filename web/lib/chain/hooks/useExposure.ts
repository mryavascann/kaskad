"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canClassify, classifyPositions, readBookCached, type Book } from "../book";
import { exposure, type BorrowerLabels } from "../exposure";
import type { Result, Scenario } from "../types";

export type LabelsError = "unconfigured" | "invalid-key" | "quota-exhausted" | "rate-limited" | "unavailable" | "failed";
const errors: LabelsError[] = ["unconfigured", "invalid-key", "quota-exhausted", "rate-limited", "unavailable", "failed"];
// Only complete successful responses are shared. Failures may be retried, without reloading the app.
const labelCache = new Map<number, { until: number; promise: Promise<BorrowerLabels> }>();
function fetchLabels(assetId: number): Promise<BorrowerLabels> {
  const cached = labelCache.get(assetId);
  if (cached && cached.until > Date.now()) return cached.promise;
  const promise = fetch(`/api/labels?asset=${assetId}`, { signal: AbortSignal.timeout(35_000) }).then(async (res) => {
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error && errors.includes(body.error as LabelsError) ? body.error : "failed");
    }
    return (await res.json()) as BorrowerLabels;
  });
  promise.catch(() => { if (labelCache.get(assetId)?.promise === promise) labelCache.delete(assetId); });
  labelCache.set(assetId, { promise, until: Date.now() + 60_000 });
  return promise;
}

/** Classify the exact book and settled result before associating any borrower with a risk. */
export function useExposure(scenario: Scenario | null, result: Result | null) {
  const eligible = scenario !== null && result !== null && canClassify(scenario);
  const assetId = eligible ? scenario.assetId : null;
  const maxPositions = scenario?.maxPositions ?? 0;
  const [attempt, setAttempt] = useState(0);
  const key = `${assetId}:${maxPositions}:${attempt}`;
  const [read, setRead] = useState<{ key: string; book: Book; labels: BorrowerLabels } | null>(null);
  const [error, setError] = useState<{ key: string; code: LabelsError } | null>(null);
  useEffect(() => {
    if (assetId === null) return;
    let live = true;
    Promise.all([readBookCached(assetId, maxPositions), fetchLabels(assetId)])
      .then(([book, labels]) => { if (live) setRead({ key, book, labels }); })
      .catch((e) => {
        const message = String((e as Error)?.message ?? e);
        if (live) setError({ key, code: errors.includes(message as LabelsError) ? message as LabelsError : "failed" });
      });
    return () => { live = false; };
  }, [assetId, maxPositions, key]);
  const current = eligible && read?.key === key ? read : null;
  const value = useMemo(() => {
    if (!current || !scenario || !result || current.labels.assetId !== scenario.assetId) return null;
    return exposure(classifyPositions(current.book, result, scenario), current.book.positions.map((p) => p.raw), current.labels);
  }, [current, scenario, result]);
  const retry = useCallback(() => {
    if (assetId !== null) labelCache.delete(assetId);
    setAttempt((n) => n + 1);
  }, [assetId]);
  const failed = eligible && error?.key === key ? error.code : current && value === null ? "failed" : null;
  return { eligible, exposure: value, labels: current?.labels ?? null, error: failed, loading: eligible && value === null && !failed, retry };
}
