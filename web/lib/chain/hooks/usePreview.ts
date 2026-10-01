"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { previewError, type PreviewError } from "../engine-model";
import type { Result, Scenario } from "../types";

/** Debounce of the free preview (useKaskad.ts:102): at most ~1 request/s while a control moves. */
export const PREVIEW_DEBOUNCE_MS = 600;

type State = { key: string; result: Result | null; error: PreviewError | null; ms: number };

/** A preview already read elsewhere (the server's first render) for `scenario`. */
export type InitialPreviewData = { scenario: Scenario; result: Result; ms: number };

/**
 * Debounced free preview (app/_components/useKaskad.ts:76-107): 600 ms debounce, a sequence guard
 * against stale responses, `loading` derived from the request key (no setState in the effect body).
 * While loading, `result` is still the previous one (as on the legacy screen); `resultScenario` says
 * which scenario it belongs to. Pass null to disable.
 *
 * `initial` seeds the state when its scenario is the one on screen at mount: that result shows at
 * once and is not fetched again (a later change, or coming back to the same scenario while its result
 * is still the one held, needs no request either).
 */
export function usePreview(scenario: Scenario | null, initial?: InitialPreviewData | null) {
  const key = scenario ? JSON.stringify(scenario) : null;
  const [state, setState] = useState<State>(() => {
    const k = initial ? JSON.stringify(initial.scenario) : null;
    return k !== null && k === key && initial ? { key: k, result: initial.result, error: null, ms: initial.ms } : { key: "", result: null, error: null, ms: 0 };
  });
  const seq = useRef(0);
  // The key of the result held in state, read by the effect without making it a dependency.
  const held = useRef(state.key);
  useEffect(() => {
    held.current = state.error ? "" : state.key;
  }, [state]);

  useEffect(() => {
    if (key === null) return;
    // Bumped first: a request still in flight for another scenario must not land over this one.
    const id = ++seq.current;
    if (held.current === key) return;
    const t = setTimeout(async () => {
      const t0 = performance.now();
      try {
        // engine.ts (viem encode/decode + read client) loads with the first preview, after hydration.
        const { previewScenario } = await import("../engine");
        const result = await previewScenario(JSON.parse(key) as Scenario);
        if (id === seq.current) setState({ key, result, error: null, ms: performance.now() - t0 });
      } catch (e) {
        if (id !== seq.current) return;
        setState({ key, result: null, error: previewError(e), ms: 0 });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key]);

  const resultKey = state.key;
  const resultScenario = useMemo(() => (resultKey ? (JSON.parse(resultKey) as Scenario) : null), [resultKey]);

  return {
    result: state.result,
    error: state.error,
    loading: key !== null && state.key !== key,
    /** Wall time of the eth_call that produced `result`, ms. */
    ms: state.ms,
    resultScenario,
  };
}
