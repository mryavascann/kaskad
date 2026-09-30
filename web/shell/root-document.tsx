import type { ReactNode } from "react";
import { fontVariables } from "@/design/fonts";
import { ToasterSlot } from "@/design/ui/toaster-slot";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { DemoModeAttribute } from "@/motion/demo-mode";
import { MotionProvider } from "@/motion/provider";
import { RevealNoScript } from "@/motion/reveal";

/**
 * <html> + <body> with fonts and the app-wide providers. Every root layout (one per locale, and
 * app/design) renders through this, so they cannot drift apart. Kept light, since it is in every
 * page's initial JS: Motion features load async (`MotionProvider` = LazyMotion), the Toaster (sonner)
 * mounts on first use (`ToasterSlot`), and each `Tooltip` brings its own provider (no root Radix).
 */
export function RootDocument({ locale, bodyClassName, children }: { locale: Locale; bodyClassName?: string; children: ReactNode }) {
  return (
    <html lang={locale} className={cn(fontVariables, "h-full antialiased")}>
      <body className={cn("flex min-h-full flex-col font-sans", bodyClassName)}>
        <RevealNoScript />
        <DemoModeAttribute />
        <MotionProvider>{children}</MotionProvider>
        <ToasterSlot />
      </body>
    </html>
  );
}
