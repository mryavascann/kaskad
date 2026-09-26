"use client";
import { useSigner } from "@/components/ui/use-signer";

import Link from "next/link";

import { shortAddr } from "@/lib/kaskad/format";
import { signerLabel } from "@/lib/kaskad/signer";

/** Header chip: which wallet signs on-chain actions; links to the connect tab. */
export function SignerBadge() {
  const s = useSigner();
  return (
    <Link
      href="/baglan"
      className="rounded-full border border-accent/50 px-3 py-1 text-xs text-accent hover:bg-accent/10"
      title="İmzalayan cüzdanı değiştir"
    >
      {s.address ? `${signerLabel[s.kind]} · ${shortAddr(s.address)}` : "Cüzdan bağla"}
    </Link>
  );
}
