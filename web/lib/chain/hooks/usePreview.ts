"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { previewError, previewScenario, type PreviewError } from "../engine";
import type { Result, Scenario } from "../types";

/** Debounce of the free preview (useKaskad.ts:102): at most ~1 request/s while a control moves. */
export const PREVIEW_DEBOUNCE_MS = 600;

type State = { key: string; result: Result | null; error: PreviewError | null; ms: number };

/**
 * Debounced free preview (app/_components/useKaskad.ts:76-107): 600 ms debounce, a sequence guard
 * against stale responses, `loading` derived from the request key (no setState in the effect body).
 * While loading, `result` is still the previous one (as on the legacy screen); `resultScenario` says
 * which scenario it belongs to. Pass null to disable.
 */
export function usePreview(scenario: Scenario | null) {
  const key = scenario ? JSON.stringify(scenario) : null;
  const [state, setState] = useState<State>({ key: "", result: null, error: null, ms: 0 });
  const seq = useRef(0);

  useEffect(() => {
    if (key === null) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const t0 = performance.now();
      try {
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
