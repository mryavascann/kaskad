"use client";

import { useEffect, useState } from "react";
import type { Classification } from "../book";
import { fetchFinding, fetchFindingPositions, type Finding } from "../finding";

/**
 * The landing finding, fetched once in the browser (2 requests), optionally with the per-position
 * tiles (about 2 more). A Server Component can call fetchFinding() directly instead.
 */
export function useFinding(opts: { positions?: boolean } = {}) {
  const withPositions = opts.positions ?? false;
  const [finding, setFinding] = useState<Finding | null>(null);
  const [positions, setPositions] = useState<Classification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const f = await fetchFinding();
        if (!live) return;
        setFinding(f);
        if (withPositions) {
          const c = await fetchFindingPositions(f);
          if (live) setPositions(c);
        }
      } catch (e) {
        if (live) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      live = false;
    };
  }, [withPositions]);

  return { finding, positions, error, loading: finding === null && error === null };
}
