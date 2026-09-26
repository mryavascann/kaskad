"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers3 } from "lucide-react";
import { SignerBadge } from "@/app/_components/SignerBadge";

export function Navigation() {
  const path = usePathname();
  return <header className="site-header"><nav className="nav-pill" aria-label="Ana gezinme"><Link href="/" className="brand"><span className="brand-mark"><Layers3 size={21} /></span>kaskad<span className="brand-period">.</span></Link><div className="nav-links">{[["/", "Protokol"],["/cuzdan", "Param güvende mi?"],["/baglan", "Cüzdan bağla"]].map(([href,label])=><Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</div><div className="nav-signer"><SignerBadge /></div></nav></header>;
}
