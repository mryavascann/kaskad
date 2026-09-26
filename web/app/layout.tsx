import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kaskad: zincir üstü likidasyon kaskadı simülatörü",
  description: "“Şu varlık %3 depeg olursa ne olur?” sorusunu Monad'da, tek tx'te, herkesin doğrulayabileceği şekilde cevaplar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              <span className="text-accent">▼</span> Kaskad
            </Link>
            <Link href="/" className="text-sm text-muted hover:text-text">
              Protokol
            </Link>
            <Link href="/cuzdan" className="text-sm text-muted hover:text-text">
              Param güvende mi?
            </Link>
            <span className="ml-auto rounded-full border border-line px-3 py-1 text-xs text-muted">
              Monad testnet · veri: Monad mainnet Aave
            </span>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line py-4 text-center text-xs text-muted">
          Monad üzerinde · Aave verisi · Envio HyperSync · Alchemy
        </footer>
      </body>
    </html>
  );
}
