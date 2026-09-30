import type { Metadata } from "next";
import "../globals.css";
import { commonMessages } from "@/i18n/messages/common";
import { RootDocument } from "@/shell/root-document";
import { siteDescription } from "@/shell/site-metadata";
import { SiteShell } from "@/shell/site-shell";

const t = commonMessages.tr.meta;

export const metadata: Metadata = {
  title: { default: t.title, template: "%s · Kaskad" },
  description: siteDescription("tr"),
  applicationName: "Kaskad",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument locale="tr">
      <SiteShell locale="tr">{children}</SiteShell>
    </RootDocument>
  );
}
