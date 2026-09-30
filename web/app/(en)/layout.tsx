import type { Metadata } from "next";
import "../globals.css";
import { commonMessages } from "@/i18n/messages/common";
import { RootDocument } from "@/shell/root-document";
import { SiteShell } from "@/shell/site-shell";

const t = commonMessages.en.meta;

export const metadata: Metadata = {
  title: { default: t.title, template: "%s · Kaskad" },
  description: t.description,
  applicationName: "Kaskad",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument locale="en">
      <SiteShell locale="en">{children}</SiteShell>
    </RootDocument>
  );
}
