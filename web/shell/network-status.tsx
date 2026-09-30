"use client";

import { LiveIndicator } from "@/design/ui/status-dot";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { LiveBlock } from "@/lib/chain/hooks/useLiveBlock";

/**
 * `● MONAD TESTNET · BLOCK 66,989,757`. Presentational: the owner polls once with `useLiveBlock()` and
 * passes the state to every copy (desktop bar, mobile sheet), so a page never runs two pollers.
 */
export function NetworkStatus({ live, locale, t, className }: { live: LiveBlock; locale: Locale; t: CommonMessages["network"]; className?: string }) {
  const { block, error } = live;
  const offline = error !== null && block === null;
  return (
    <LiveIndicator
      className={className}
      label={offline ? t.offline : t.name}
      tone={offline ? "liq" : "safe"}
      pulse={!offline}
      valueLabel={t.block}
      value={offline ? undefined : block === null ? null : Number(block)}
      loadingLabel={t.connecting}
      formatValue={formatters(locale).int}
      title={t.liveLabel}
    />
  );
}
