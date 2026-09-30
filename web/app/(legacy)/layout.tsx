import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import "./legacy.css";
import { Navigation } from "@/components/sections/Navigation";
import { RootDocument } from "@/shell/root-document";

export const metadata: Metadata = {
  title: "Kaskad: zincir üstü likidasyon kaskadı simülatörü",
  description: "“Şu varlık %3 depeg olursa ne olur?” sorusunu Monad'da, tek tx'te, herkesin doğrulayabileceği şekilde cevaplar.",
};

// Root layout of the pre-redesign pages (/, /cuzdan, /baglan) until the new pages replace them in stage 4.
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument locale="tr">
      <a href="#main" className="skip-link">İçeriğe geç</a>
      <div className="ambient-background" aria-hidden="true" />
      <Navigation />
      <main id="main" className="main-shell">{children}</main>
      <footer className="site-footer"><Link className="brand" href="/">kaskad.</Link><span>Monad · Aave verisi · Envio HyperSync · Alchemy · Mera</span><a href="https://github.com/mryavascann/kaskad" target="_blank" rel="noreferrer">GitHub ↗</a><span className="footer-network"><span className="status-dot" /> Monad testnet</span></footer>
    </RootDocument>
  );
}
