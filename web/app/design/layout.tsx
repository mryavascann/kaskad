import "../globals.css";
import { RootDocument } from "@/shell/root-document";

// /design has its own chrome (header + table of contents), so it gets a bare root document.
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
