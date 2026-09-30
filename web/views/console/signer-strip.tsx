"use client";

import { ArrowUpRight, ChevronDown, Fingerprint, KeyRound, Wallet, Zap } from "lucide-react";
import { memo } from "react";
import { formatEther } from "viem";
import { buttonStyles } from "@/design/ui/button-styles";
import { Button } from "@/design/ui/button";
import { Callout } from "@/design/ui/callout";
import { Disclosure } from "@/design/ui/disclosure";
import { Label } from "@/design/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/design/ui/popover";
import { Skeleton } from "@/design/ui/skeleton";
import { StatusDot } from "@/design/ui/status-dot";
import type { Locale } from "@/i18n/config";
import { formatters } from "@/i18n/format";
import { consoleMessages } from "@/i18n/messages/console";
import { useSigner } from "@/lib/chain/hooks/useSigner";
import { useSignerBalances } from "@/lib/chain/hooks/useSignerBalances";
import { useSignerConnect } from "@/lib/chain/hooks/useSignerConnect";
import { FAUCET_URL } from "@/lib/chain/sponsor";
import { addrUrl } from "@/lib/kaskad/config";
import { shortAddr } from "@/lib/kaskad/format";
import { cn } from "@/lib/utils";

const mon = (wei: bigint) => Number(formatEther(wei));

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 bg-elev-1 px-4 py-3", className)}>
      <Label as="p">{label}</Label>
      <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

/**
 * Who signs and pays for "Prove on chain": the active signer, its balance, the sponsor budget that
 * funds the temporary wallet, and the switch to a browser wallet or a Mera passkey. Replaces the old
 * /baglan page. Reads only (balances, GET /api/fund); switching signers never sends a transaction.
 * A memo: scenario edits re-render the console, not the strip (its balance polls re-render only it).
 */
export const SignerStrip = memo(function SignerStrip({ locale }: { locale: Locale }) {
  const t = consoleMessages[locale].signer;
  const fmt = formatters(locale);
  const signer = useSigner();
  const conn = useSignerConnect();
  const { burner, balances, sponsor, sponsorLow } = useSignerBalances({ injected: conn.injected, mera: conn.mera });

  const address = signer.kind === "burner" ? (signer.address ?? burner) : signer.address;
  const balance = balances[signer.kind];
  const reserve = sponsor?.reserveWei != null ? fmt.mon(mon(sponsor.reserveWei)) : null;

  return (
    <section aria-label={t.region} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line-2 bg-line sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_1.1fr_auto]">
        <Cell label={t.active}>
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
            <Skeleton className="h-4 w-24" />
          )}
        </Cell>
        <Cell label={t.balance}>
          {balance === null ? <Skeleton className="h-4 w-20" /> : <span className="font-mono text-body-sm text-fg-1">{fmt.mon(mon(balance))}</span>}
        </Cell>
        <Cell label={t.sponsor}>
          {sponsor ? (
            <>
              <span className={cn("font-mono text-body-sm", sponsorLow ? "text-warn-hi" : "text-fg-1")}>{fmt.mon(mon(sponsor.spendableWei))}</span>
              <span className="text-caption text-fg-3">{t.sponsorCaption({ reserve })}</span>
            </>
          ) : (
            <Skeleton className="h-4 w-28" />
          )}
        </Cell>
        <div className="flex flex-wrap items-center gap-2 bg-elev-1 px-4 py-3 sm:col-span-2 lg:col-span-1 lg:justify-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" loading={conn.busy}>
                <Wallet aria-hidden />
                {t.connect}
                <ChevronDown aria-hidden className="text-fg-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-2">
              <Button size="sm" variant="ghost" className="justify-start" onClick={() => void conn.connectInjected()} disabled={conn.busy}>
                <Wallet aria-hidden />
                {t.injected}
              </Button>
              <Button size="sm" variant="ghost" className="justify-start" onClick={() => void conn.connectMera("login")} disabled={conn.busy}>
                <Fingerprint aria-hidden />
                {t.meraLogin}
              </Button>
              <Button size="sm" variant="ghost" className="justify-start" onClick={() => void conn.connectMera("create")} disabled={conn.busy}>
                <KeyRound aria-hidden />
                {t.meraCreate}
              </Button>
              {signer.kind !== "burner" && (
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => conn.selectBurner()}>
                  <Zap aria-hidden />
                  {t.burner}
                </Button>
              )}
            </PopoverContent>
          </Popover>
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
