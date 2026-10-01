"use client";

import { ArrowUpRight } from "lucide-react";
import { createElement, memo, useCallback, useEffect, useState } from "react";
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
import { fetchBalance } from "@/lib/chain/balance";
import { peekBurner } from "@/lib/chain/burner-peek";
import { useSigner, type SignerKind } from "@/lib/chain/hooks/useSigner";
import { useSignerBalances } from "@/lib/chain/hooks/useSignerBalances";
import { useSignerConnect } from "@/lib/chain/hooks/useSignerConnect";
import { loadSigner } from "@/lib/chain/signer";
import { FAUCET_URL, fetchSponsor, isSponsorLow, type SponsorStatus } from "@/lib/chain/sponsor";
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

/** A skeleton on a line of value text (the value's line height), so the value lands without a shift. */
function Hold({ className, text = "text-body-sm" }: { className: string; text?: "text-body-sm" | "text-caption" }) {
  return (
    <span className={cn("flex h-[1lh] items-center", text)}>
      <Skeleton className={className} />
    </span>
  );
}

/** No temporary wallet yet: a dash, named for screen readers and on hover. */
function NotCreated({ label, className }: { label: string; className?: string }) {
  return (
    <span title={label} className={cn("font-mono text-fg-3", className ?? "text-body-sm")}>
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 bg-elev-1 px-4 py-3", className)}>
      <Label as="p">{label}</Label>
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

/**
 * What the strip reads: the signer's address, its balance and the sponsor budget (null: not read yet).
 * `fresh`: no temporary wallet exists yet (no key in this browser), so it has no address or balance to read.
 */
type Readings = { kind: SignerKind; address: Address | null; balance: bigint | null; sponsor: SponsorStatus | null; sponsorLow: boolean; fresh: boolean };
const UNREAD: Readings = { kind: "burner", address: null, balance: null, sponsor: null, sponsorLow: false, fresh: false };

/**
 * A reading over the previous one: for the same signer, values not read yet keep the previous ones (the
 * live reads start with nulls; the light first read must not flash back to skeletons). A new signer starts over.
 */
const merge = (prev: Readings, next: Readings): Readings =>
  prev.kind !== next.kind
    ? next
    : {
        kind: next.kind,
        address: next.address ?? prev.address,
        balance: next.balance ?? prev.balance,
        sponsor: next.sponsor ?? prev.sponsor,
        sponsorLow: next.sponsor ? next.sponsorLow : prev.sponsorLow,
        fresh: next.address ? false : next.fresh || prev.fresh,
      };

/** The reads, from the signer module and the balance poll; reports them with `onRead`. Renders nothing. */
function LiveReadings({ injected, mera, onRead }: { injected: Address | null; mera: Address | null; onRead: (r: Readings) => void }) {
  const signer = useSigner({ load: "idle" });
  const { burner, balances, sponsor, sponsorLow } = useSignerBalances({ injected, mera });
  const address = signer.kind === "burner" ? (signer.address ?? burner) : signer.address;
  const balance = balances[signer.kind];
  const kind = signer.kind;
  useEffect(() => onRead({ kind, address, balance, sponsor, sponsorLow, fresh: false }), [kind, address, balance, sponsor, sponsorLow, onRead]);
  return null;
}

/**
 * The strip's first read when nobody has interacted yet, without the signer module (viem and secp256k1
 * would cost about a second of main thread on a phone): the sponsor budget (GET /api/fund), and the
 * temporary wallet from localStorage (burner-peek.ts). No key yet: nothing to read (`fresh`). A key with
 * its remembered address: one plain-fetch eth_getBalance. A key without one: `onNeedSigner`, and the
 * full reads load. A failed balance read shows 0, as the live reads do. Renders nothing.
 */
function FirstReadings({ onRead, onNeedSigner }: { onRead: (r: Readings) => void; onNeedSigner: () => void }) {
  useEffect(() => {
    let live = true;
    const burner = peekBurner();
    if (burner.kind === "unknown") {
      onNeedSigner();
      return;
    }
    void (async () => {
      const [sponsor, balance] = await Promise.all([
        fetchSponsor(),
        burner.kind === "known" ? fetchBalance(burner.address).catch(() => 0n) : Promise.resolve(null),
      ]);
      if (!live) return;
      onRead({
        kind: "burner",
        address: burner.kind === "known" ? burner.address : null,
        balance,
        sponsor,
        sponsorLow: isSponsorLow(sponsor?.spendableWei ?? null),
        fresh: burner.kind === "none",
      });
    })();
    return () => {
      live = false;
    };
  }, [onRead, onNeedSigner]);
  return null;
}

/**
 * Who signs and pays for "Prove on chain": the active signer, its balance, the sponsor budget that
 * funds the temporary wallet, and the switch to a browser wallet or a Mera passkey. Replaces the old
 * /baglan page. Reads only (balances, GET /api/fund); switching signers never sends a transaction.
 * A memo: scenario edits re-render the console, not the strip (its balance polls re-render only it).
 *
 * The strip fills by itself once the browser is idle after the first paint (at most
 * `SIGNER_READ_IDLE_MS` later) with a light first read (`FirstReadings`: no viem). The full reads
 * (signer module: burner key and viem accounts; balance poll; sponsor) start with the reader's first
 * scroll, touch, press, key or mouse move, or as soon as they reach for the strip. Until the first read
 * lands the cells show their skeletons (same boxes as the values: no shift). The signer menu's code still
 * waits for intent (the stand-in button looks the same and opens it). The kind of signer is exact
 * from the start: every page load begins with the sponsored burner.
 */
export const SignerStrip = memo(function SignerStrip({ locale }: { locale: Locale }) {
  const t = consoleMessages[locale].signer;
  const fmt = formatters(locale);
  const signer = useSigner();
  const conn = useSignerConnect();
  const engaged = useMountGate("intent");
  const idle = useMountGate("idle", SIGNER_READ_IDLE_MS);
  const [needSigner, setNeedSigner] = useState(false);
  const onNeedSigner = useCallback(() => setNeedSigner(true), []);
  // The full reads (signer module, balance poll) start with intent, or on idle when only they can tell the address.
  const live = engaged || needSigner;
  const [wantMenu, setWantMenu] = useState(false);
  const Menu = useLoadedWhen(engaged || wantMenu, loadMenu);
  const [{ address, balance, sponsor, sponsorLow, fresh }, setReadings] = useState<Readings>(UNREAD);
  const onRead = useCallback((r: Readings) => setReadings((prev) => merge(prev, r)), []);
  const reserve = sponsor?.reserveWei != null ? fmt.mon(mon(sponsor.reserveWei)) : null;
  // Before the reads start the placeholders hold still: a shimmer here would repaint the top of the page
  // every frame for as long as the reader leaves it alone.
  const still = idle ? undefined : "motion-safe:animate-none";

  return (
    <section aria-label={t.region} className="flex flex-col gap-3" onPointerEnter={preload} onFocusCapture={preload}>
      {idle && !live && <FirstReadings onRead={onRead} onNeedSigner={onNeedSigner} />}
      {live && <LiveReadings injected={conn.injected} mera={conn.mera} onRead={onRead} />}
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
          ) : fresh ? (
            // As wide as the skeleton and the address, so it wraps (or not) the same way.
            <NotCreated label={t.notCreated} className="inline-block w-24 text-caption" />
          ) : (
            <Hold text="text-caption" className={cn("h-4 w-24", still)} />
          )}
        </Cell>
        <Cell label={t.balance}>
          {balance !== null ? (
            <span className="font-mono text-body-sm text-fg-1">{fmt.mon(mon(balance))}</span>
          ) : fresh ? (
            <NotCreated label={t.notCreated} />
          ) : (
            <Hold className={cn("h-4 w-20", still)} />
          )}
        </Cell>
        <Cell label={t.sponsor}>
          {/* The caption has its own line in both states; before the read an invisible copy of it (the
              reserve stands in as 0, never shown) holds the same lines, so the value lands without a shift. */}
          {sponsor ? (
            <>
              <span className={cn("font-mono text-body-sm", sponsorLow ? "text-warn-hi" : "text-fg-1")}>{fmt.mon(mon(sponsor.spendableWei))}</span>
              <span className="basis-full text-caption text-fg-3">{t.sponsorCaption({ reserve })}</span>
            </>
          ) : (
            <>
              <Hold className={cn("h-4 w-28", still)} />
              <span aria-hidden className="invisible basis-full text-caption">
                {t.sponsorCaption({ reserve: fmt.mon(0) })}
              </span>
            </>
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
