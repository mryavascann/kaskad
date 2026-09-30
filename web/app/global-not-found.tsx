import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "@/design/fonts";
import { IntentLink } from "@/design/ui/intent-link";
import { Eyebrow } from "@/design/ui/label";
import { LogoMark } from "@/design/ui/logo";
import { href } from "@/i18n/config";

export const metadata: Metadata = { title: "404 · Kaskad", robots: { index: false } };

// Unmatched URLs across all root layouts (app/(en), app/(tr), app/design). Bilingual on purpose: the
// locale of a URL that matches nothing is unknown.
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col items-center justify-center bg-bg px-4 font-sans text-fg-1">
        <main className="flex max-w-xl flex-col gap-6 py-24">
          <LogoMark size={32} title="Kaskad" />
          <Eyebrow index="404">Signal lost</Eyebrow>
          <h1 className="text-title-1">This page is not on the chain.</h1>
          <p className="text-lead text-fg-2" lang="tr">Bu sayfa zincirde yok.</p>
          <p className="flex flex-wrap gap-3">
            <IntentLink href={href("home", "en")} className="rounded-control border border-line-3 px-4 py-2.5 text-body-sm hover:border-line-strong">
              Back to Kaskad
            </IntentLink>
            <IntentLink href={href("home", "tr")} lang="tr" className="rounded-control border border-line-3 px-4 py-2.5 text-body-sm hover:border-line-strong">
              Türkçe ana sayfa
            </IntentLink>
          </p>
        </main>
      </body>
    </html>
  );
}
