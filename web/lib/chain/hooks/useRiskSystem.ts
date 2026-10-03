"use client";

import { useCallback, useEffect, useState } from "react";
import { onIdle } from "../idle";
import { pollWhileVisible } from "../poll";
import { readRiskSystem, RISK_POLL_MS, type RiskSystem } from "../risk-oracle";

/**
 * RiskOracle, GuardV2 and RiskVault, re-read every 20 s while the tab is visible. Read errors keep the
 * last state (`error` is set only while nothing was read yet). `refresh()` re-reads now; `set()` takes
 * the state an action already re-read. Starts once the browser is idle after the first paint.
 */
export function useRiskSystem() {
  const [system, setSystem] = useState<RiskSystem | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSystem(await readRiskSystem());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const cancel = onIdle(() => {
      stop = pollWhileVisible(refresh, RISK_POLL_MS);
    });
    return () => {
      cancel();
      stop?.();
    };
  }, [refresh]);

  const set = useCallback((s: RiskSystem | null) => {
    if (s) setSystem(s);
  }, []);

  return { system, error: error && system === null, refresh, set };
}
