import Link from "next/link";
import "./legacy.css";
import { Navigation } from "@/components/sections/Navigation";

// Chrome of the pre-redesign pages. URLs are unchanged (route group). Replaced in stage 4.
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">İçeriğe geç</a>
      <div className="ambient-background" aria-hidden="true" />
      <Navigation />
      <main id="main" className="main-shell">{children}</main>
      <footer className="site-footer"><Link className="brand" href="/">kaskad.</Link><span>Monad · Aave verisi · Envio HyperSync · Alchemy · Mera</span><a href="https://github.com/mryavascann/kaskad" target="_blank" rel="noreferrer">GitHub ↗</a><span className="footer-network"><span className="status-dot" /> Monad testnet</span></footer>
    </>
  );
}
