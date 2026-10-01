"use client";

/**
 * next/link that prefetches on intent (pointer over it, touch start or keyboard focus) instead of
 * when it scrolls into view. The nav and the CTAs are on screen at load: viewport prefetch pulled the
 * JS of every linked route (~330 KB gz, viem included) right after `load`, competing with the page's
 * own requests on slow connections. A `prefetch` prop from the caller wins.
 * Pattern: node_modules/next/dist/docs/01-app/02-guides/prefetching.md, "Hover-triggered prefetch".
 */
import Link from "next/link";
import { useState, type ComponentProps } from "react";

export type IntentLinkProps = ComponentProps<typeof Link>;

export function IntentLink({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: IntentLinkProps) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      // `null` restores the default (static routes: full prefetch) once the user shows intent.
      prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      {...props}
    />
  );
}
