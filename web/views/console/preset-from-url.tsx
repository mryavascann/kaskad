"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Applies `?preset=<id>` (links from the command menu) once per distinct value, also when the console
 * is already open. Render it inside <Suspense>: the search params are only known in the browser.
 */
export function PresetFromUrl({ onPreset }: { onPreset: (id: string) => void }) {
  const id = useSearchParams().get("preset");
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (id && id !== applied.current) {
      applied.current = id;
      onPreset(id);
    }
  }, [id, onPreset]);
  return null;
}
