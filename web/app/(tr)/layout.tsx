import type { Metadata } from "next";
import "../globals.css";
import { RootDocument } from "@/shell/root-document";
import { rootMetadata } from "@/shell/site-metadata";
import { SiteShell } from "@/shell/site-shell";

export const metadata: Metadata = rootMetadata("tr");

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument locale="tr">
      <SiteShell locale="tr">{children}</SiteShell>
    </RootDocument>
  );
}
