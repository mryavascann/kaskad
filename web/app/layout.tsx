import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/sections/Navigation";
import { ToastProvider } from "@/components/ui/feedback";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kaskad: zincir üstü likidasyon kaskadı simülatörü",
  description: "“Şu varlık %3 depeg olursa ne olur?” sorusunu Monad'da, tek tx'te, herkesin doğrulayabileceği şekilde cevaplar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <a href="#main" className="skip-link">İçeriğe geç</a>
        <div className="ambient-background" aria-hidden="true" />
        <Navigation />
        <main id="main" className="main-shell">{children}</main>
        <footer className="site-footer"><Link className="brand" href="/">kaskad.</Link><span>Monad · Aave verisi · Envio HyperSync · Alchemy · Mera</span><a href="https://github.com/mryavascann/kaskad" target="_blank" rel="noreferrer">GitHub ↗</a><span className="footer-network"><span className="status-dot" /> Monad testnet</span></footer>
        <ToastProvider />
      </body>
    </html>
  );
}
