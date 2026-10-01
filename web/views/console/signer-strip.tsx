"use client";

import { ArrowUpRight } from "lucide-react";
import { createElement, memo, useEffect, useState } from "react";
import type { Address } from "viem";
import { buttonStyles } from "@/design/ui/button-styles";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Disclosure } from "@/design/ui/disclosure";
import { Label } from "@/design/ui/label";
import { Skeleton } from "@/design/ui/skeleton";
import { StatusDot } from "@/design/ui/status-dot";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { useSigner } from "@/lib/chain/hooks/useSigner";
import { useSignerBalances } from "@/lib/chain/hooks/useSignerBalances";
import { useSignerConnect } from "@/lib/chain/hooks/useSignerConnect";
import { loadSigner } from "@/lib/chain/signer";
import { FAUCET_URL, type SponsorStatus } from "@/lib/chain/sponsor";
import { formatEther } from "@/lib/chain/units";
import { addrUrl } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";
import { useLoadedWhen, useMountGate } from "./mount-gate";
import { SignerMenuLabel } from "./signer-menu-label";

const mon = (wei: bigint) => Number(formatEther(wei));
const preload = () => void loadSigner().catch(() => {});
const loadMenu = () => import("./signer-menu").then((m) => m.SignerMenu);
/**
 * Upper bound on the wait for the strip's reads when the reader does nothing: the strip is on the
 * first screen (the last thing on it on phones), so it fills by itself shortly after the first paint.
 */
export const SIGNER_READ_IDLE_MS = 1_800;

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 bg-elev-1 px-4 py-3", className)}>
      <Label as="p">{label}</Label>
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

/** What the strip reads: the signer's address, its balance and the sponsor budget (null: not read yet). */
type Readings = { address: Address | null; balance: bigint | null; sponsor: SponsorStatus | null; sponsorLow: boolean };
const UNREAD: Readings = { address: null, balance: null, sponsor: null, sponsorLow: false };

/** The reads, from the signer module and the balance poll; reports them with `onRead`. Renders nothing. */
function LiveReadings({ injected, mera, onRead }: { injected: Address | null; mera: Address | null; onRead: (r: Readings) => void }) {
  const signer = useSigner({ load: "idle" });
  const { burner, balances, sponsor, sponsorLow } = useSignerBalances({ injected, mera });
  const address = signer.kind === "burner" ? (signer.address ?? burner) : signer.address;
  const balance = balances[signer.kind];
  useEffect(() => onRead({ address, balance, sponsor, sponsorLow }), [address, balance, sponsor, sponsorLow, onRead]);
  return null;
}

/**
 * Who signs and pays for "Prove on chain": the active signer, its balance, the sponsor budget that
 * funds the temporary wallet, and the switch to a browser wallet or a Mera passkey. Replaces the old
 * /baglan page. Reads only (balances, GET /api/fund); switching signers never sends a transaction.
 * A memo: scenario edits re-render the console, not the strip (its balance polls re-render only it).
 *
 * The reads (signer module: burner key and viem accounts; balances; sponsor) start once the browser
 * is idle after the first paint (at most `SIGNER_READ_IDLE_MS` later), or earlier with the reader's
 * first scroll, touch, press, key or mouse move, or as soon as they reach for the strip; until then
 * its cells show their skeletons (same boxes as the values: no shift). The signer menu's code still
 * waits for intent (the stand-in button looks the same and opens it). The kind of signer is exact
 * from the start: every page load begins with the sponsored burner.
 */
export const SignerStrip = memo(function SignerStrip({ locale }: { locale: Locale }) {
  const t = consoleMessages[locale].signer;
  const fmt = formatters(locale);
  const signer = useSigner();
  const conn = useSignerConnect();
  const engaged = useMountGate("intent");
  const live = useMountGate("idle", SIGNER_READ_IDLE_MS);
  const [wantMenu, setWantMenu] = useState(false);
  const Menu = useLoadedWhen(engaged || wantMenu, loadMenu);
  const [{ address, balance, sponsor, sponsorLow }, setReadings] = useState<Readings>(UNREAD);
  const reserve = sponsor?.reserveWei != null ? fmt.mon(mon(sponsor.reserveWei)) : null;
  // Before the reads start the placeholders hold still: a shimmer here would repaint the top of the page
  // every frame for as long as the reader leaves it alone.
  const still = live ? undefined : "motion-safe:animate-none";

  return (
    <section aria-label={t.region} className="flex flex-col gap-3" onPointerEnter={preload} onFocusCapture={preload}>
      {live && <LiveReadings injected={conn.injected} mera={conn.mera} onRead={setReadings} />}
      {/* Phones: signer full width, balance | sponsor, actions full width. sm–lg: 2 × 2 (no empty cell). lg: one row. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line-2 bg-line lg:grid-cols-[1.3fr_0.8fr_1.1fr_auto]">
        <Cell label={t.active} className="col-span-2 sm:col-span-1">
          <StatusDot tone={signer.kind === "burner" ? "monad" : "safe"} />
          <span className="text-body-sm font-medium text-fg-1">{t.kinds[signer.kind]}</span>
          {address ? (
            <a
              href={addrUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 font-mono text-caption text-fg-2 hover:text-fg-1"
            >
              {shortAddr(address)}
              <ArrowUpRight className="size-3.5 text-fg-3 group-hover:text-fg-1" aria-hidden />
              <span className="sr-only">({t.addressLink({ address })})</span>
            </a>
          ) : (
            <Skeleton className={cn("h-4 w-24", still)} />
          )}
        </Cell>
        <Cell label={t.balance}>
          {balance === null ? <Skeleton className={cn("h-4 w-20", still)} /> : <span className="font-mono text-body-sm text-fg-1">{fmt.mon(mon(balance))}</span>}
        </Cell>
        <Cell label={t.sponsor}>
          {sponsor ? (
            <>
              <span className={cn("font-mono text-body-sm", sponsorLow ? "text-warn-hi" : "text-fg-1")}>{fmt.mon(mon(sponsor.spendableWei))}</span>
              <span className="text-caption text-fg-3">{t.sponsorCaption({ reserve })}</span>
            </>
          ) : (
            <Skeleton className={cn("h-4 w-28", still)} />
          )}
        </Cell>
        <div className="col-span-2 flex flex-wrap items-center gap-2 bg-elev-1 px-4 py-3 sm:col-span-1 lg:justify-end">
          {Menu ? (
            // createElement: `Menu` is a loaded module export (stable), not a component made during render.
            createElement(Menu, { locale, conn, kind: signer.kind, defaultOpen: wantMenu })
          ) : (
            // Stands in until the menu's chunk arrives (the reader's first intent); a press opens it once loaded.
            <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setWantMenu(true)}>
              <SignerMenuLabel locale={locale} />
            </Button>
          )}
          <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            {t.faucet}
            <ArrowUpRight aria-hidden />
          </a>
        </div>
      </div>
      {sponsorLow && (
        <Callout tone="warn" live="polite" className="py-2.5">
          {t.sponsorLow}
        </Callout>
      )}
      {conn.error && <Callout tone="liq" title={t.errors[conn.error.code]} className="py-2.5" />}
      <div className="flex flex-col gap-x-6 gap-y-1 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-caption text-fg-3 sm:flex sm:min-h-8 sm:items-center">{t.free}</p>
        <Disclosure summary={t.feesTitle} className="shrink-0 text-caption sm:max-w-md">
          <p className="text-caption text-fg-2">{t.fees}</p>
        </Disclosure>
      </div>
    </section>
  );
});
