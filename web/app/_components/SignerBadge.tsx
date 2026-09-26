"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { shortAddr } from "@/lib/kaskad/format";
import { signerLabel, signerStore } from "@/lib/kaskad/signer";

/** Header chip: which wallet signs on-chain actions; links to the connect tab. */
export function SignerBadge() {
  const s = useSyncExternalStore(signerStore.subscribe, signerStore.get, signerStore.server);
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
