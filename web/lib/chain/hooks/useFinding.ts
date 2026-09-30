"use client";

import { useEffect, useState } from "react";
import type { Classification } from "../book";
import { fetchFinding, fetchFindingPositions, type Finding } from "../finding";

/**
 * Whether a finding read in the browser may replace the one on screen: only a read at a newer block
 * (a lagging RPC node answers with an older one), and one whose positions are consistent when the
 * current finding has consistent positions.
 */
export function isNewerFinding(current: Finding | null, next: Finding): boolean {
  if (!current) return true;
  if (current.blockNumber === null) return true;
  return next.blockNumber !== null && next.blockNumber > current.blockNumber;
}

/**
 * The landing finding, fetched once in the browser (2 requests), optionally with the per-position
 * tiles (about 2 more). A Server Component can call fetchFinding() directly instead.
 *
 * With `initial` (a server read), the browser read only replaces it when it ran at a newer block
 * and, with `positions`, came with a consistent classification; a failed, older or inconsistent
 * read leaves the server data in place (`error` still reports a failure).
 */
export function useFinding(opts: { positions?: boolean; initial?: Finding | null; initialPositions?: Classification | null } = {}) {
  const withPositions = opts.positions ?? false;
  const [finding, setFinding] = useState<Finding | null>(opts.initial ?? null);
  const [positions, setPositions] = useState<Classification | null>(opts.initialPositions ?? null);
  const [error, setError] = useState<string | null>(null);
  const initial = opts.initial ?? null;
  const initialConsistent = opts.initialPositions?.consistent === true;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const f = await fetchFinding();
        if (!live || !isNewerFinding(initial, f)) return;
        // Without server data, show the finding as soon as it arrives (the tiles follow).
        if (!initial || !withPositions) setFinding(f);
        if (!withPositions) return;
        const c = await fetchFindingPositions(f);
        if (!live) return;
        // Keep a consistent server pair rather than swap in a finding whose tiles can't be shown.
        if (initial && initialConsistent && !c.consistent) return;
        setFinding(f);
        setPositions(c);
      } catch (e) {
        if (live) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      live = false;
    };
  }, [withPositions, initial, initialConsistent]);

  return { finding, positions, error, loading: finding === null && error === null };
}
