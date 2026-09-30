import type { ReactNode } from "react";
import { fontVariables } from "@/design/fonts";
import { Toaster } from "@/design/ui/toaster";
import { TooltipProvider } from "@/design/ui/tooltip";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { DemoModeAttribute } from "@/motion/demo-mode";
import { MotionProvider } from "@/motion/provider";
import { RevealNoScript } from "@/motion/reveal";

/**
 * <html> + <body> with fonts and the app-wide providers. Every root layout (one per locale, plus the
 * legacy group until it is removed) renders through this, so they cannot drift apart.
 */
export function RootDocument({ locale, bodyClassName, children }: { locale: Locale; bodyClassName?: string; children: ReactNode }) {
  return (
    <html lang={locale} className={cn(fontVariables, "h-full antialiased")}>
      <body className={cn("flex min-h-full flex-col font-sans", bodyClassName)}>
        <RevealNoScript />
        <DemoModeAttribute />
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
